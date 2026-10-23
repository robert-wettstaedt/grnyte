import { ascents, routes } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { blank, formError } from '$lib/forms/schemas'
import type { Context } from '$lib/remote/authed.server'
import { requireRowForm } from '$lib/remote/require.server'
import { invalid } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import { createUpdateEvent, insertEvent } from '../event/event.server'
import { notify, notifyMentions } from '../notification/notification.server'
import { recalcUserGradeAndRating } from '../route/user-grade.server'
import { recordAccolades } from './accolade.server'
import type { AscentFormValue } from './dto'
import { canEditAscent, canLogAscent } from './permissions'

type SaveContext = Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>

/** Log an ascent of a route. Answers `{ id }` instead of redirecting so the form can
 *  finalize its background media uploads against the new ascent before navigating. */
export async function createAscentRow(value: AscentFormValue, { afterCommit, db, user, userRegions }: SaveContext) {
  const route = await db.query.routes.findFirst({
    where: and(eq(routes.id, value.routeId), isNull(routes.deletedAt)),
  })

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
      notes: blank(value.notes),
      rating: value.rating,
      regionFk: route.regionFk,
      routeFk: route.id,
      temperature: value.temperature,
      type: value.type,
    })
    .returning()

  await recalcUserGradeAndRating(db, route.id)

  // Before the event, so the card the event produces can read the claim off the ascent it points
  // at rather than waiting a sync tick for it.
  await recordAccolades(db, { createdBy: user.id, routeFk: route.id }, user.id)

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
      object: { id: ascent.id, type: 'ascent' },
      regionFk: route.regionFk,
    }),
  )

  // No `redirectTo`, for the reason `createRoute` gives: a 303 discards this return value, and the
  // form needs the id to finalize its uploads against the new ascent.
  return { data: { id: ascent.id } }
}

/** Edit an ascent. Reuses the create form (with `id` set). */
export async function updateAscentRow(
  { id, ...value }: AscentFormValue,
  { afterCommit, db, user, userRegions }: SaveContext,
) {
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
      notes: blank(value.notes),
      rating: value.rating ?? null,
      temperature: value.temperature ?? null,
      type: value.type,
    })
    .where(eq(ascents.id, ascent.id))

  await recalcUserGradeAndRating(db, ascent.routeFk)

  // A correction can move the two things a claim reads: the grade, and whether the row is an
  // attempt or a send. Both can make a banner true that was not, or false that was.
  await recordAccolades(db, ascent, user.id)

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

  // A region admin may edit anybody's log, and the climber has no other way of finding out.
  // `notify` drops the actor from the recipients, so editing your own is silent.
  //
  // Gated on the diff, not on the submit: a region admin who opens somebody's ascent and saves it
  // untouched logs no event, and must not announce one either. Worse than the noise, the
  // unique index would keep that empty save as the row for this (actor, ascent, kind) pair and
  // swallow the real edit that followed it.
  if (edited) {
    afterCommit(() =>
      notify({
        actorFk: user.id,
        object: { id: ascent.id, type: 'ascent' },
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
      object: { id: ascent.id, type: 'ascent' },
      previousBody: ascent.notes,
      regionFk: ascent.regionFk,
    }),
  )

  return {
    data: { id: ascent.id, routeFk: ascent.routeFk },
    redirectTo: entityHref('routes', ascent.routeFk),
  }
}
