import { command, getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { ascents, ascentTypeEnum, files, routes, users } from '$lib/db/schema'
import { formError, stringToInt, stringToIntOptional } from '$lib/forms/schemas'
import { authedForm } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { requireRow, requireRowForm } from '$lib/remote/require.server'
import { error, invalid } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'
import { createUpdateActivity, insertActivity } from '../activity/activity.server'
import { stringifyDeletedAscent } from '../activity/verbs'
import { deleteFileRows, removeFileStorage } from '../file/cleanup.server'
import { recalcUserGradeAndRating } from '../route/user-grade.server'
import { canEditAscent, canLogAscent } from './permissions'

const ascentActionSchema = z.object({
  dateTime: z.iso.date({ error: formError('form_required') }),
  gradeFk: stringToIntOptional,
  humidity: stringToIntOptional.pipe(
    z.int().min(0, formError('form_numInvalid')).max(100, formError('form_numInvalid')).optional(),
  ),
  id: stringToIntOptional,
  notes: z.string().optional().default(''),
  // 1–3 stars; the field is absent when unrated (same convention as the route form).
  rating: stringToIntOptional.pipe(z.int().min(1).max(3).optional()),
  routeId: stringToInt,
  temperature: stringToIntOptional.pipe(
    z.int().min(-30, formError('form_numInvalid')).max(50, formError('form_numInvalid')).optional(),
  ),
  type: z.enum(ascentTypeEnum, { error: formError('form_required') }),
})

/** Field shape the shared add/edit-ascent form binds to, `id` is set only when editing. */
export type AscentFormInput = z.input<typeof ascentActionSchema>

/** Log an ascent of a route. Returns `{ id }` instead of redirecting so the form can
 *  finalize its background media uploads against the new ascent before navigating. */
export const createAscent = authedForm(ascentActionSchema, async (value, { db, user, userRegions }) => {
  const route = await db.query.routes.findFirst({ where: eq(routes.id, value.routeId) })

  if (route == null) {
    invalid(formError('routes_notFound'))
  }

  if (!canLogAscent(userRegions, route)) {
    invalid(formError('form_noPermission'))
  }

  const [ascent] = await db
    .insert(ascents)
    .values({
      createdBy: user.id,
      dateTime: value.dateTime,
      gradeFk: value.gradeFk,
      humidity: value.humidity,
      notes: value.notes.length === 0 ? null : value.notes,
      rating: value.rating,
      regionFk: route.regionFk,
      routeFk: route.id,
      temperature: value.temperature,
      type: value.type,
    })
    .returning()

  await recalcUserGradeAndRating(db, route.id)

  await insertActivity(db, {
    entityId: ascent.id,
    entityType: 'ascent',
    newValue: value.type,
    parentEntityId: route.id,
    parentEntityType: 'route',
    regionFk: route.regionFk,
    type: 'created',
    userFk: user.id,
  })

  return { data: { id: ascent.id } }
})

/** Edit an ascent. Reuses the create form (with `id` set). Owner-only (RLS mirrors this). */
export const updateAscent = authedForm(ascentActionSchema, async ({ id, ...value }, { db, user, userRegions }) => {
  const ascent = await requireRowForm(
    () => (id == null ? Promise.resolve(undefined) : db.query.ascents.findFirst({ where: eq(ascents.id, id) })),
    (row) => canEditAscent(userRegions, user.id, row),
    formError('ascents_notFound'),
  )

  await db
    .update(ascents)
    .set({
      dateTime: value.dateTime,
      gradeFk: value.gradeFk ?? null,
      humidity: value.humidity ?? null,
      notes: value.notes.length === 0 ? null : value.notes,
      rating: value.rating ?? null,
      temperature: value.temperature ?? null,
      type: value.type,
    })
    .where(eq(ascents.id, ascent.id))

  await recalcUserGradeAndRating(db, ascent.routeFk)

  await createUpdateActivity({
    db,
    entityId: ascent.id,
    entityType: 'ascent',
    newEntity: {
      dateTime: value.dateTime,
      gradeFk: value.gradeFk,
      humidity: value.humidity,
      notes: value.notes,
      rating: value.rating,
      temperature: value.temperature,
      type: value.type,
    },
    oldEntity: {
      dateTime: ascent.dateTime,
      gradeFk: ascent.gradeFk,
      humidity: ascent.humidity,
      notes: ascent.notes ?? '',
      rating: ascent.rating,
      temperature: ascent.temperature,
      type: ascent.type,
    },
    parentEntityId: ascent.routeFk,
    parentEntityType: 'route',
    regionFk: ascent.regionFk,
    userFk: user.id,
  })

  return { data: { id: ascent.id, routeFk: ascent.routeFk } }
})

/**
 * Delete an ascent and its attached media (rows plus Nextcloud images and Bunny
 * videos). Owner-only. No undo, which the form's confirmation dialog spells out.
 *
 * Hand-wired like finalizeImage rather than authedCommand: the irreversible storage
 * removal must run only after the DB delete commits, so a mid-transaction failure
 * (a later step, or the commit itself) can never resurrect the ascent with its media
 * already gone.
 */
export const deleteAscent = command(
  z.object({ id: z.number() }),
  async ({ id }): Promise<MutationResult<{ routeFk: number }>> => {
    const { supabase, user, userRegions } = getRequestEvent().locals
    if (user == null) {
      error(401, 'Not authenticated')
    }
    const rls = await createDrizzleSupabaseClient(supabase)

    const { routeFk, storage } = await rls(async (db) => {
      const ascent = await requireRow(
        () => db.query.ascents.findFirst({ where: eq(ascents.id, id) }),
        (row) => canEditAscent(userRegions, user.id, row),
        'Ascent not found',
      )

      const fileRows = await db.query.files.findMany({
        columns: { bunnyStreamFk: true, id: true, path: true },
        where: eq(files.ascentFk, id),
      })
      const storage = await deleteFileRows(db, fileRows)

      await db.delete(ascents).where(eq(ascents.id, id))

      await recalcUserGradeAndRating(db, ascent.routeFk)

      // Whose ascent this was, written down while it still can be: the row is gone by the time
      // any card renders, so the feed has nothing else to read it off. A maintainer clearing up
      // somebody else's log otherwise gets "removed an ascent of Rampe" with no owner in it.
      const climber = await db.query.users.findFirst({
        columns: { username: true },
        where: eq(users.id, ascent.createdBy),
      })

      await insertActivity(db, {
        entityId: ascent.id,
        entityType: 'ascent',
        metadata:
          climber == null
            ? undefined
            : stringifyDeletedAscent({ climberFk: ascent.createdBy, climberName: climber.username }),
        oldValue: ascent.type,
        parentEntityId: ascent.routeFk,
        parentEntityType: 'route',
        regionFk: ascent.regionFk,
        type: 'deleted',
        userFk: user.id,
      })

      return { routeFk: ascent.routeFk, storage }
    })

    // Only now that the row deletion has committed: destroy the backing bytes.
    await removeFileStorage(storage)

    return { data: { routeFk } }
  },
)
