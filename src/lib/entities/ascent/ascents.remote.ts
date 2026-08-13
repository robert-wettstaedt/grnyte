import { command, getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { ascents, ascentTypeEnum, files, routes, users } from '$lib/db/schema'
import { formError, stringToInt, stringToIntOptional } from '$lib/forms/schemas'
import { authedForm } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { requireRow, requireRowForm } from '$lib/remote/require.server'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import z from 'zod'
import { stringifyDeletedAscent } from '../activity/verbs'
import { canHardDelete, createUpdateEvent, insertEvent } from '../event/event.server'
import { deleteFileRows, removeFileStorage } from '../file/cleanup.server'
import { notify, notifyMentions } from '../notification/notification.server'
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
export const createAscent = authedForm(ascentActionSchema, async (value, { afterCommit, db, user, userRegions }) => {
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

  await insertEvent(db, {
    actorFk: user.id,
    object: { id: ascent.id, type: 'ascent' },
    regionFk: route.regionFk,
    verb: 'create',
  })

  afterCommit(() =>
    notifyMentions({
      actorFk: user.id,
      body: value.notes,
      entityId: ascent.id,
      entityType: 'ascent',
      regionFk: route.regionFk,
    }),
  )

  return { data: { id: ascent.id } }
})

/** Edit an ascent. Reuses the create form (with `id` set). Owner-only (RLS mirrors this). */
export const updateAscent = authedForm(
  ascentActionSchema,
  async ({ id, ...value }, { afterCommit, db, user, userRegions }) => {
    const ascent = await requireRowForm(
      () =>
        id == null
          ? Promise.resolve(undefined)
          : db.query.ascents.findFirst({ where: and(eq(ascents.id, id), isNull(ascents.deletedAt)) }),
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

    const edited = await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: {
        dateTime: value.dateTime,
        gradeFk: value.gradeFk,
        humidity: value.humidity,
        notes: value.notes,
        rating: value.rating,
        temperature: value.temperature,
        type: value.type,
      },
      object: { id: ascent.id, type: 'ascent' },
      oldEntity: {
        dateTime: ascent.dateTime,
        gradeFk: ascent.gradeFk,
        humidity: ascent.humidity,
        notes: ascent.notes ?? '',
        rating: ascent.rating,
        temperature: ascent.temperature,
        type: ascent.type,
      },
      regionFk: ascent.regionFk,
    })

    // A maintainer may edit anybody's log, and the climber has no other way of finding out.
    // `notify` drops the actor from the recipients, so editing your own is silent.
    //
    // Gated on the diff, not on the submit: a maintainer who opens somebody's ascent and saves it
    // untouched logs no activity, and must not announce one either. Worse than the noise, the
    // unique index would keep that empty save as the row for this (actor, ascent, kind) pair and
    // swallow the real edit that followed it.
    if (edited) {
      afterCommit(() =>
        notify({
          actorFk: user.id,
          entityId: ascent.id,
          entityType: 'ascent',
          regionFk: ascent.regionFk,
          sourceType: 'ascent_edited',
          userFks: [ascent.createdBy],
        }),
      )
    }

    afterCommit(() =>
      notifyMentions({
        actorFk: user.id,
        body: value.notes,
        entityId: ascent.id,
        entityType: 'ascent',
        previousBody: ascent.notes,
        regionFk: ascent.regionFk,
      }),
    )

    return { data: { id: ascent.id, routeFk: ascent.routeFk } }
  },
)

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

    const { climberFk, regionFk, routeFk, storage } = await rls(async (db) => {
      const ascent = await requireRow(
        () => db.query.ascents.findFirst({ where: and(eq(ascents.id, id), isNull(ascents.deletedAt)) }),
        (row) => canEditAscent(userRegions, user.id, row),
        'Ascent not found',
      )

      const fileRows = await db.query.files.findMany({
        columns: { bunnyStreamFk: true, id: true, path: true },
        where: eq(files.ascentFk, id),
      })
      const storage = await deleteFileRows(db, fileRows)

      // The grace window. Logged within the last fifteen minutes, this is somebody correcting a
      // mistake, so the row goes for good and `on delete cascade` takes its events with it,
      // leaving no trace. Any older and it has been seen: it soft-deletes and keeps its history,
      // which is also what lets a card still name what was removed.
      // `childless: true` is a claim this call site earns, and the constraint list is what earns
      // it: exactly three tables reference `ascents`, and only `files` is ON DELETE NO ACTION.
      // `deleteFileRows` above has already removed those rows for good, and `changes` and
      // `events` both cascade. Nothing is left to strand.
      //
      // That depends on files being hard-deleted. If they are ever tombstoned instead, a
      // surviving `files.ascent_fk` pins this row and the delete below fails on it, so this
      // claim has to be revisited at the same time.
      const erasable = await canHardDelete(db, {
        childless: true,
        createdAt: ascent.createdAt,
        object: { id: ascent.id, type: 'ascent' },
      })

      if (erasable) {
        await db.delete(ascents).where(eq(ascents.id, id))
      } else {
        await db.update(ascents).set({ deletedAt: new Date() }).where(eq(ascents.id, id))
      }

      await recalcUserGradeAndRating(db, ascent.routeFk)

      // Only when somebody else did it. Deleting your own log entry is not news: the card
      // disappearing IS what deleting means, and announcing it defeats the point. A maintainer
      // clearing up another person's log is accountability and stays on the record.
      //
      // Nothing at all is written for a mistake, because the cascade just removed the event this
      // would hang beside.
      if (!erasable && user.id !== ascent.createdBy) {
        // Whose ascent this was, in metadata: on a soft delete the row survives so the card could
        // read it, but the climber's NAME still cannot be read off an ascent, and the sentence
        // needs it ("Jonas removed Mara's ascent of Rampe").
        const climber = await db.query.users.findFirst({
          columns: { username: true },
          where: eq(users.id, ascent.createdBy),
        })

        await insertEvent(db, {
          actorFk: user.id,
          // The climber's NAME, which is the one thing the object cannot answer: a soft-deleted
          // ascent still knows `created_by`, but the sentence needs "Mara", not an id.
          metadata:
            climber == null
              ? null
              : stringifyDeletedAscent({ climberFk: ascent.createdBy, climberName: climber.username }),
          object: { id: ascent.id, type: 'ascent' },
          regionFk: ascent.regionFk,
          verb: 'delete',
        })
      }

      return { climberFk: ascent.createdBy, regionFk: ascent.regionFk, routeFk: ascent.routeFk, storage }
    })

    // Before the storage teardown, not after: the delete has committed either way, so a failing
    // Nextcloud or Bunny call must not be what swallows the climber's only notice of it.
    //
    // Points at the ROUTE, not the ascent: the ascent row is gone by the time the inbox renders,
    // so a row pointing at it could only ever be a tombstone, while the route is standing right
    // there and is where the reader wants to go. The cost is that two of your ascents on one
    // route deleted by the same person collapse into one notification, which is what a reader
    // would want anyway.
    // Logged rather than awaited into the caller: a fan-out that throws (a lookup that fails, a
    // pool with nothing left) must not be what skips the teardown below and leaves the bytes of a
    // deleted ascent behind forever. Nothing sweeps those up later.
    await notify({
      actorFk: user.id,
      entityId: routeFk,
      entityType: 'route',
      regionFk,
      sourceType: 'ascent_deleted',
      userFks: [climberFk],
    }).catch((exception) => console.error('[ascents] delete notification failed', exception))

    // Only now that everything that can still fail has: destroy the backing bytes.
    await removeFileStorage(storage)

    return { data: { routeFk } }
  },
)
