import { ascents, files, users } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull } from 'drizzle-orm'
import { canHardDelete, insertEvent } from '../event/event.server'
import { stringifyDeletedAscent } from '../event/metadata'
import { deleteFileRows, removeFileStorage } from '../file/cleanup.server'
import { notify } from '../notification/notification.server'
import { recalcUserGradeAndRating } from '../route/user-grade.server'
import { recordAccolades } from './accolade.server'
import { canEditAscent } from './permissions'

/**
 * Delete an ascent and its attached media (rows plus Nextcloud images and Bunny
 * videos). Owner-only. No undo, which the row's confirmation dialog spells out.
 * The irreversible storage removal runs after commit, so a failed transaction can never
 * resurrect the ascent with its media already gone.
 */
export async function deleteAscentRow(
  { id }: { id: number },
  { afterCommit, db, user, userRegions }: Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>,
) {
  const ascent = await requireRow(
    () => db.query.ascents.findFirst({ where: and(eq(ascents.id, id), isNull(ascents.deletedAt)) }),
    (row) => canEditAscent(userRegions, user.id, row),
    formError('ascents_notFound'),
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
    // The claim goes with it, in the same statement. The create card deliberately SURVIVES a
    // soft delete and keeps reading this row, so a banner left standing would celebrate a send
    // the climber withdrew, directly beside the card saying it was removed. Nothing downstream
    // can catch it either: neither the Zero relation nor `entityOf` filters `deleted_at`, and
    // `syncAccolades` skips soft-deleted rows so it would never clear this one.
    await db.update(ascents).set({ accolade: null, deletedAt: new Date() }).where(eq(ascents.id, id))
  }

  await recalcUserGradeAndRating(db, ascent.routeFk)

  // Removing an attempt shortens the run behind a send, so the claim on that send is now
  // counting a session that is gone.
  await recordAccolades(db, ascent, user.id)

  // Whoever did it, once the ascent is old enough to soft-delete. The card does NOT disappear
  // when you delete your own: an event outlives what it describes, so the "You flashed Rampe"
  // card stays on the feed, reactable, reading its grade and note off a row that is gone from
  // the logbook and the grade recalc. Saying nothing left that card standing as the only
  // account of a send that no longer exists.
  //
  // Nothing at all is written for a mistake inside the grace window, because the cascade has already
  // removed the event this would hang beside, which is what makes that path leave no trace.
  if (!erasable) {
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
        climber == null ? null : stringifyDeletedAscent({ climberFk: ascent.createdBy, climberName: climber.username }),
      object: { id: ascent.id, type: 'ascent' },
      regionFk: ascent.regionFk,
      verb: 'delete',
    })
  }

  // Points at the ROUTE: the ascent is gone by the time the inbox renders. Queued before the
  // teardown, and `drainAfterCommit` runs each on its own, so a failed fan-out never skips it.
  afterCommit(() =>
    notify({
      actorFk: user.id,
      object: { id: ascent.routeFk, type: 'route' },
      regionFk: ascent.regionFk,
      sourceType: 'ascent_deleted',
      userFks: [ascent.createdBy],
    }),
  )
  afterCommit(() => removeFileStorage(storage))

  return { data: { routeFk: ascent.routeFk } }
}
