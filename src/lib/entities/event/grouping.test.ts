import { describe, expect, it } from 'vitest'
import { event } from './fixture'
import { groupEvents } from './grouping'
import type { EventListItem } from './mapper'

const MINUTE = 60 * 1000
const day = (n: number, hour = 12) => new Date(2026, 0, n, hour).getTime()

const ascent = (partial: Partial<EventListItem> = {}) =>
  event({ objectType: 'ascent', parent: { id: 500, type: 'route' }, verb: 'create', ...partial })

/** Crag edits under one block, the locality a burst keys on. */
const underBlock = { parent: { id: 400, type: 'block' } } as const

/** An upload: the object is the file, and the parent is what it landed on. */
const upload = (partial: Partial<EventListItem> = {}) =>
  event({ objectType: 'file', verb: 'add', ...underBlock, ...partial })

describe('groupEvents', () => {
  it('groups one climber s ascents from the same day into a session', () => {
    const groups = groupEvents([
      ascent({ createdAt: day(2, 18), objectId: 10 }),
      ascent({ createdAt: day(2, 9), objectId: 11 }),
      // Same climber, previous day: its own card.
      ascent({ createdAt: day(1, 10), objectId: 12 }),
      // Same day, different climber: their own session.
      ascent({ actorFk: 2, createdAt: day(2, 11), objectId: 13 }),
      ascent({ actorFk: 2, createdAt: day(2, 10), objectId: 14 }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session', 'session', 'single'])
    expect(groups[0].events.map((e) => e.objectId)).toEqual([10, 11])
    expect(groups[0].actorFk).toBe(1)
    expect(groups[1].actorFk).toBe(2)
  })

  it('groups one editor s crag edits under the same parent into a burst, and splits on the window', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      event({ createdAt: noon, objectId: 1, parent: { id: 7, type: 'block' } }),
      event({ createdAt: noon - 5 * MINUTE, objectId: 2, parent: { id: 7, type: 'block' } }),
      // Same parent but an hour earlier: out of the 30 minute window.
      event({ createdAt: noon - 60 * MINUTE, objectId: 3, parent: { id: 7, type: 'block' } }),
      // In the window, but a different parent block.
      event({ createdAt: noon - 2 * MINUTE, objectId: 4, parent: { id: 8, type: 'block' } }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['burst', 'single', 'single'])
    expect(groups[0].events.map((e) => e.objectId)).toEqual([1, 2])
    expect(groups[1].events.map((e) => e.objectId)).toEqual([4])
  })

  it('keeps whole entity deletions out of the burst they would read as edits in', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      event({ createdAt: noon, objectId: 1, verb: 'delete', ...underBlock }),
      event({ createdAt: noon - MINUTE, objectId: 2, verb: 'delete', ...underBlock }),
      event({ createdAt: noon - 2 * MINUTE, objectId: 1, ...underBlock }),
      // Removing a photo really is an edit: the entity is still there, its photo is not. That is
      // `remove` now, where the old shape had to say "deleted, but with a column".
      event({ createdAt: noon - 3 * MINUTE, objectId: 2, verb: 'remove', ...underBlock }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['removal', 'burst'])
    expect(groups[0].events.map((e) => e.objectId)).toEqual([1, 2])
    expect(groups[1].events.map((e) => e.objectId)).toEqual([1, 2])
  })

  it('groups anyone s edits to the same non crag entity by entity', () => {
    const groups = groupEvents([
      event({ actorFk: 1, createdAt: day(1, 12), objectId: 5, objectType: 'user' }),
      event({ actorFk: 2, createdAt: day(1, 12) - MINUTE, objectId: 5, objectType: 'user' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('entity')
    // Mixed actors: the card credits the newest one.
    expect(groups[0].actorFk).toBe(1)
  })

  it('sorts newest first and dates a group by its newest event', () => {
    const groups = groupEvents([
      event({ createdAt: day(1, 9), objectId: 1 }),
      ascent({ createdAt: day(3), objectId: 2 }),
      event({ createdAt: day(2), objectId: 3 }),
    ])

    expect(groups.map((group) => group.createdAt)).toEqual([day(3), day(2), day(1, 9)])
  })

  it('keeps a log that runs past midnight in one session', () => {
    const groups = groupEvents([
      ascent({ createdAt: day(2, 0) + 4 * MINUTE, objectId: 10 }),
      ascent({ createdAt: day(1, 23) + 56 * MINUTE, objectId: 11 }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('session')
  })

  it('keeps a photo pulled off an ascent out of the session card', () => {
    const groups = groupEvents([
      ascent({ createdAt: day(1, 12), objectId: 10 }),
      ascent({ createdAt: day(1, 11), objectId: 11 }),
      // Media housekeeping, not a send. Shaped the way the writer actually produces it: a file
      // removal logs on the PARENT, because the file row is gone by then, so this is an event
      // ABOUT the ascent. An earlier version of this test used `objectType: 'file'`, which no
      // writer ever emits, and so passed while the real case counted photo deletions as sends.
      event({ createdAt: day(1, 10), objectId: 12, objectType: 'ascent', verb: 'remove' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session', 'single'])
    expect(groups[0].events).toHaveLength(2)
  })

  it('keeps a card s id when a newer event joins it', () => {
    const older = event({ createdAt: day(1, 12), id: 1, objectId: 1, parent: { id: 7, type: 'block' } })
    const newer = event({ createdAt: day(1, 12) + MINUTE, id: 2, objectId: 2, parent: { id: 7, type: 'block' } })

    const before = groupEvents([older])
    const after = groupEvents([newer, older])

    expect(after[0].events).toHaveLength(2)
    expect(after[0].id).toBe(before[0].id)
  })

  it('folds one submit s uploads into a single card, on the entity they landed on', () => {
    // Every event points at its own file id, so without grouping on the parent this is five
    // cards. That is the whole reason `upload` is a kind of its own.
    const noon = day(1, 12)
    const groups = groupEvents([
      upload({ createdAt: noon, objectId: 'f1' }),
      upload({ createdAt: noon - MINUTE, objectId: 'f2' }),
      upload({ createdAt: noon - 2 * MINUTE, objectId: 'f3' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('upload')
    expect(groups[0].events).toHaveLength(3)
  })

  it('keeps uploads out of the editor s crag burst', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      event({ createdAt: noon, objectId: 1, ...underBlock }),
      upload({ createdAt: noon - MINUTE, objectId: 'f1' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['single', 'single'])
  })

  it('folds an upload into the create of the thing it landed on', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      // The photos land on the route, moments after it was created under its block.
      upload({ createdAt: noon, objectId: 'f1', parent: { id: 50, type: 'route' } }),
      upload({ createdAt: noon - MINUTE, objectId: 'f2', parent: { id: 50, type: 'route' } }),
      event({ createdAt: noon - 2 * MINUTE, objectId: 50, parent: { id: 7, type: 'block' }, verb: 'create' }),
    ])

    expect(groups).toHaveLength(1)
    // The create leads, so the card says "added the route" rather than "added photos to it".
    expect(groups[0].events[0].verb).toBe('create')
    expect(groups[0].events).toHaveLength(3)
  })

  it('leaves a session alone when a clip landed on one of its ascents', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      ascent({ createdAt: noon, objectId: 10 }),
      ascent({ createdAt: noon - MINUTE, objectId: 11 }),
      // One clip on one of them. Folding it in would make the card speak that ascent's verb and
      // count one video for an afternoon in which the reader did three things.
      upload({ createdAt: noon - 2 * MINUTE, objectId: 'f1', parent: { id: 10, type: 'ascent' } }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session', 'single'])
    expect(groups[0].events).toHaveLength(2)
  })

  it('keys a merged card on its oldest event, not on whatever sits last', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      upload({ createdAt: noon, id: 30, objectId: 'f1', parent: { id: 50, type: 'route' } }),
      event({ createdAt: noon - MINUTE, id: 10, objectId: 50, parent: { id: 7, type: 'block' }, verb: 'create' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].id).toMatch(/#10$/)
  })

  it('leaves uploads alone when nothing created their parent nearby', () => {
    const groups = groupEvents([upload({ createdAt: day(1, 12), objectId: 'f1', parent: { id: 50, type: 'route' } })])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('single')
  })

  it('never folds two regions into one card', () => {
    const groups = groupEvents([
      event({ createdAt: day(1, 12), objectId: 5, objectType: 'user', regionFk: 1 }),
      event({ createdAt: day(1, 12) - MINUTE, objectId: 5, objectType: 'user', regionFk: 2 }),
    ])

    expect(groups).toHaveLength(2)
  })

  it('separates uploads by the entity they landed on', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      upload({ createdAt: noon, objectId: 'f1', parent: { id: 50, type: 'route' } }),
      upload({ createdAt: noon - MINUTE, objectId: 'f2', parent: { id: 51, type: 'route' } }),
    ])

    expect(groups).toHaveLength(2)
  })

  it('returns nothing for no events', () => {
    expect(groupEvents([])).toEqual([])
  })
})
