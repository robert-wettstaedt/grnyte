import { areas } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { blank, formError, type FormMessage } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { and, eq, isNull, not } from 'drizzle-orm'
import { createUpdateEvent, insertEvent } from '../event/event.server'
import { notifyMentions } from '../notification/notification.server'
import { refreshAreaType } from './area.server'
import type { areaActionSchema } from './dto'
import { loadParentArea, requireEditableArea } from './guards.server'
import { canAddArea } from './permissions'

export type Refuse = (message: FormMessage, field?: 'name') => never

type Value = z.output<typeof areaActionSchema>
type Writer = Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>

/** Areas sharing a parent; top-level ones share their region. Name clashes are checked over these. */
const siblingsOf = (regionFk: number, parentFk: null | number | undefined) =>
  parentFk == null ? and(eq(areas.regionFk, regionFk), isNull(areas.parentFk)) : eq(areas.parentFk, parentFk)

export async function createAreaRow(value: Value, { afterCommit, db, user, userRegions }: Writer, refuse: Refuse) {
  const { parent: parentArea, status } = await loadParentArea(db, value.parentFk, value.regionFk)

  if (status === 'missing') {
    refuse(formError('areas_parentNotFound'))
  }

  if (
    !canAddArea(userRegions, { ...value, type: null }) ||
    (parentArea != null && !canAddArea(userRegions, parentArea))
  ) {
    refuse(formError('form_noPermission'))
  }

  // A child must live in its parent's region; otherwise it could be created in region A
  // under a parent in region B, where B can neither see nor moderate it.
  if (status === 'wrongRegion') {
    refuse(formError('form_noPermission'))
  }

  // Live siblings only: a cleared one is absent from the tree, the map and search, so refusing
  // against it names a blocker the reader cannot find or clear. Restoring it later can leave two
  // siblings sharing a name, which is the accepted cost of the reader-facing reading.
  const existingAreasResult = await db.query.areas.findMany({
    where: and(isNull(areas.deletedAt), eq(areas.name, value.name), siblingsOf(value.regionFk, parentArea?.id)),
  })

  if (existingAreasResult.length > 0) {
    refuse(formError('areas_nameExists', { name: existingAreasResult[0].name }), 'name')
  }

  // `regionFk` and `parentFk` are client-supplied here on purpose: on a create there is no stored
  // row to disagree with, `canAddArea` gates on exactly these values, and `loadParentArea` has
  // already refused a cross-region parent.
  const [createdArea] = await db
    .insert(areas)
    .values({
      createdBy: user.id,
      // Empty stores as NULL, never '': "not set" gets one representation, so a later
      // `description IS NULL` means what it says. Same as `routes` and `blocks`. Trimmed,
      // because the editor reserialises an emptied document with a trailing newline.
      description: blank(value.description),
      name: value.name,
      parentFk: value.parentFk,
      regionFk: value.regionFk,
      // Derived, never submitted: `refreshAreaType` owns this column (a block makes a sector, a
      // sub-area makes an area). A new area holds neither, so it starts untyped.
      type: null,
    })
    .returning()

  if (value.parentFk != null) {
    await refreshAreaType(db, value.parentFk)
  }

  // No name and no parent stored: an area soft-deletes, so `areas.name` and `areas.parent_fk`
  // are still readable through the object key when the card renders.
  await insertEvent(db, {
    actorFk: user.id,
    object: { id: createdArea.id, type: 'area' },
    regionFk: createdArea.regionFk,
    verb: 'create',
  })

  afterCommit(() =>
    notifyMentions({
      actorFk: user.id,
      body: value.description,
      object: { id: createdArea.id, type: 'area' },
      regionFk: createdArea.regionFk,
    }),
  )

  return { data: { id: createdArea.id }, redirectTo: entityHref('areas', createdArea.id) }
}

export async function updateAreaRow(
  { id, ...value }: Value,
  { afterCommit, db, user, userRegions }: Writer,
  refuse: Refuse,
) {
  const area = await requireEditableArea(db, userRegions, id)

  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      isNull(areas.deletedAt),
      eq(areas.name, value.name),
      siblingsOf(area.regionFk, area.parentFk),
      not(eq(areas.id, area.id)),
    ),
  })

  if (existingAreasResult.length > 0) {
    refuse(formError('areas_nameExists', { name: existingAreasResult[0].name }), 'name')
  }

  // Explicit columns, not a spread: `areaActionSchema` is shared with `createArea` and also carries
  // `regionFk` and `parentFk`. See `no-drizzle-mass-assignment` in eslint.config.js.
  await db
    .update(areas)
    .set({ description: blank(value.description), name: value.name })
    .where(eq(areas.id, area.id))

  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { description: value.description, name: value.name },
    object: { id: area.id, type: 'area' },
    oldEntity: { description: area.description, name: area.name },
    regionFk: area.regionFk,
  })

  afterCommit(() =>
    notifyMentions({
      actorFk: user.id,
      body: value.description,
      object: { id: area.id, type: 'area' },
      previousBody: area.description,
      regionFk: area.regionFk,
    }),
  )

  return { redirectTo: entityHref('areas', area.id) }
}
