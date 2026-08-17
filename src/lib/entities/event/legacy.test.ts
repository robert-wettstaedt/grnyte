import { verbEntry, verbKey } from '$lib/entities/event/verbs'
import { describe, expect, it } from 'vitest'
import { event } from './fixture'
import { legacyEvent, legacyRows } from './legacy'
import type { EventListItem } from './mapper'

/**
 * The adapter's one claim: an event resolves to the same catalogue entry the activity row it
 * replaced did. Everything downstream (headline keys, icons, diff renderers, the push digest)
 * reads that catalogue, so a triple that misses is a card with a generic sentence and no icon.
 *
 * Asserted against the real catalogue rather than a copy of the mapping, so a catalogue entry
 * renamed or removed fails here rather than degrading silently on a card.
 */
const verbOf = (partial: Partial<EventListItem>) => verbKey(legacyEvent(event(partial)))

describe('legacyEvent', () => {
  it('resolves a catalogue entry for every verb the catalogue covers', () => {
    // Each verb with the object its writers actually pair it with.
    //
    // `join` is absent on purpose: the catalogue has only `user:updated:role` and
    // `user:deleted:role`, so a join fell through to the generic verb under the old shape too.
    // That is the "created + column_name: role is how we spell Join" encoding this migration
    // exists to end, and it is the rename step that adds the entry. Pinned below instead, so the
    // day it gains one this test says so rather than staying quietly green.
    const cases: [string, Partial<EventListItem>][] = [
      ['create route', { objectType: 'route', verb: 'create' }],
      ['create area', { objectType: 'area', verb: 'create' }],
      ['create block', { objectType: 'block', verb: 'create' }],
      // The ascent type comes off the resolved entity: the catalogue keys this one on the value.
      [
        'create ascent',
        { entity: { ascentType: 'flash', name: 'Rampe', row: 'route' }, objectType: 'ascent', verb: 'create' },
      ],
      ['delete route', { objectType: 'route', verb: 'delete' }],
      ['delete area', { objectType: 'area', verb: 'delete' }],
      ['delete block', { objectType: 'block', verb: 'delete' }],
      ['delete ascent', { objectType: 'ascent', verb: 'delete' }],
      ['add file', { objectId: 'f1', objectType: 'file', verb: 'add' }],
      ['leave', { objectType: 'user', verb: 'leave' }],
      ['invite', { objectType: 'user', verb: 'invite' }],
      ['accept', { objectType: 'user', verb: 'accept' }],
    ]

    for (const [label, partial] of cases) {
      const entry = verbEntry(legacyEvent(event(partial)))
      expect(entry, label).toBeDefined()
    }
  })

  it('names the exact sentence a removal resolves, not merely some entry', () => {
    // `remove` collapsed six triples in the backfill, so the verb alone cannot invert it. Asserted
    // on the KEY rather than on `toBeDefined`, because the wrong entry is also defined: without
    // the column, a removed photo resolves `route:deleted` and the card reads "deleted the route".
    expect(verbOf({ metadata: 'photo', objectType: 'route', verb: 'remove' })).toBe('event_routeDeletedFile')
    expect(verbOf({ metadata: 'photo', objectType: 'ascent', verb: 'remove' })).toBe('event_ascentDeletedFile')
    // A user splits on whether an address was recorded: a revoked invitation, or a removed member.
    expect(verbOf({ metadata: 'lea@example.com', objectType: 'user', verb: 'remove' })).not.toBe(
      verbOf({ objectType: 'user', verb: 'remove' }),
    )
  })

  it('hands the value columns back to the readers that still look in them', () => {
    // `names: 'stored'` renders an invitation from `new_value`, because the invitee has no
    // account to resolve. `storedMedia` reads the removal word off `old_value`.
    expect(legacyEvent(event({ metadata: 'lea@example.com', verb: 'invite' })).newValue).toBe('lea@example.com')
    expect(legacyEvent(event({ metadata: 'video', objectType: 'route', verb: 'remove' })).oldValue).toBe('video')
  })

  it('tells the three actions that share the add verb apart by what the writer recorded', () => {
    // `add` covers an upload, a parking pin and a claimed first ascent. The verb alone cannot say
    // which, so the object and the metadata do: guessing produced a triple with no entry at all,
    // and both the pin and the claim fell through to "made a change".
    expect(verbOf({ metadata: '47.1,8.5', objectType: 'area', verb: 'add' })).toBe('event_areaUpdatedParkingLocation')
    expect(verbOf({ metadata: 'Wolfgang Güllich', objectType: 'user', verb: 'add' })).toBe(
      'event_userUpdatedFirstAscensionist',
    )
    expect(verbOf({ objectId: 'f1', objectType: 'file', verb: 'add' })).toBe('event_fileUploaded')
  })

  it('tells a cleared pin and a pulled topo photo from a removed file', () => {
    // All three are `remove`, and the fallback is `file`: a cleared parking pin read "removed
    // media from Steinbruch" and a pulled topo photo said the same about its block.
    expect(verbOf({ metadata: '~47.1,8.5', objectType: 'area', verb: 'remove' })).toBe(
      'event_areaDeletedParkingLocation',
    )
    expect(verbOf({ metadata: '{"action":"photoRemoved","topoId":700}', objectType: 'block', verb: 'remove' })).toBe(
      'event_blockDeletedTopo',
    )
    expect(verbOf({ metadata: 'photo', objectType: 'route', verb: 'remove' })).toBe('event_routeDeletedFile')
  })

  it('reads a topo edit that moved no column of its own off its metadata', () => {
    // A photo added or the order changed writes no change row at all, so without the metadata the
    // event resolves a bare `block:updated`, which the catalogue has no entry for.
    expect(verbOf({ metadata: '{"action":"photoAdded","topoId":700}', objectType: 'block', verb: 'update' })).toBe(
      'event_blockUpdatedTopo',
    )
  })

  it('leaves a join on the generic verb, which the catalogue rework still owes it', () => {
    const row = legacyEvent(event({ objectType: 'user', verb: 'join' }))

    // A real key either way, so a card can always render something: `verbKey` degrades where
    // `verbEntry` misses. What it cannot do is say "welcomed to the region".
    expect(verbEntry(row)).toBeUndefined()
    expect(verbKey(row)).toBeTruthy()
  })

  it('keeps the three membership verbs the catalogue covers on their own sentences', () => {
    // These shared a column until the write path gave each its own verb, which is why the feed
    // used to render somebody who left as "Mara removed Mara from the region".
    const keys = new Set([
      verbOf({ objectType: 'user', verb: 'accept' }),
      verbOf({ objectType: 'user', verb: 'invite' }),
      verbOf({ objectType: 'user', verb: 'leave' }),
    ])

    expect(keys.size).toBe(3)
  })

  it('reads an update through its change rows, one lookup per column', () => {
    const rows = legacyRows(
      event({
        changes: [
          { columnName: 'name', newValue: 'B', objectId: undefined, objectType: undefined, oldValue: 'A' },
          { columnName: 'description', newValue: 'y', objectId: undefined, objectType: undefined, oldValue: 'x' },
        ],
        objectType: 'route',
        verb: 'update',
      }),
    )

    expect(rows.map((row) => row.columnName)).toEqual(['name', 'description'])
    // And each resolves its own sentence, which is what the old one-row-per-column shape gave.
    expect(new Set(rows.map(verbKey)).size).toBe(2)
  })

  it('lets a change name a different row than its event, which is what a reorder needs', () => {
    const [row] = legacyRows(
      event({
        changes: [{ columnName: 'order', newValue: '1', objectId: 44, objectType: 'block', oldValue: '0' }],
        objectId: 12,
        objectType: 'area',
        verb: 'update',
      }),
    )

    expect(row.entityType).toBe('block')
    expect(row.entityId).toBe('44')
  })

  it('still produces one lookup for an update carrying no changes', () => {
    // Should not happen (an emptied update deletes itself), but a card with nothing to say is
    // worse than a vague one.
    expect(legacyRows(event({ objectType: 'route', verb: 'update' }))).toHaveLength(1)
  })

  it('drops a parent the catalogue has no type for, rather than inventing one', () => {
    // `file` and `user` are objects but never parents in the old shape.
    const row = legacyEvent(event({ objectType: 'route', parent: { id: 'f1', type: 'file' } }))
    expect(row.parentEntityType).toBeUndefined()
  })
})
