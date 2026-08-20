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

/** An ascent's entity, carrying only the climb day a session ends at. */
const climbedOn = (at: number) => ({ climbedAt: at, name: '', row: 'none' as const })

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

  it('groups one person s edits to the same non crag entity by entity', () => {
    const groups = groupEvents([
      event({ actorFk: 1, createdAt: day(1, 12), objectId: 5, objectType: 'user' }),
      event({ actorFk: 1, createdAt: day(1, 12) - MINUTE, objectId: 5, objectType: 'user' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('entity')
    expect(groups[0].actorFk).toBe(1)
  })

  it('never puts two people on one card', () => {
    const groups = groupEvents([
      event({ actorFk: 1, createdAt: day(1, 12), objectId: 5, objectType: 'user' }),
      event({ actorFk: 2, createdAt: day(1, 12) - MINUTE, objectId: 5, objectType: 'user' }),
    ])

    // The entity key was the last one that did not carry the actor. An admin granting a role and
    // the member renaming themselves minutes later shared a card that could name neither thing
    // and credited one avatar with both.
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.actorFk)).toEqual([1, 2])
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

  it('splits one sitting that logged two days at the crag into two sessions', () => {
    // Sunday evening, typing up the weekend. Logged three minutes apart, so the log-time window
    // alone would call this one afternoon, and the card would say "logged a session" over two.
    const groups = groupEvents([
      ascent({ createdAt: day(4, 20), entity: climbedOn(day(3)), objectId: 10 }),
      ascent({ createdAt: day(4, 20) - 3 * MINUTE, entity: climbedOn(day(3)), objectId: 11 }),
      ascent({ createdAt: day(4, 20) - 6 * MINUTE, entity: climbedOn(day(2)), objectId: 12 }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session', 'single'])
    expect(groups[0].events).toHaveLength(2)
  })

  it('keeps two climb days logged interleaved as two sessions, not three fragments', () => {
    // Sunday evening, tapping through a weekend out of order. Only the newest group per key used
    // to stay open, so each Sunday row evicted the Saturday group and the next Saturday row was
    // measured against a group it could never join.
    const groups = groupEvents([
      ascent({ createdAt: day(4, 20) + 4 * MINUTE, entity: climbedOn(day(2)), objectId: 10 }),
      ascent({ createdAt: day(4, 20) + 3 * MINUTE, entity: climbedOn(day(3)), objectId: 11 }),
      ascent({ createdAt: day(4, 20) + 2 * MINUTE, entity: climbedOn(day(3)), objectId: 12 }),
      ascent({ createdAt: day(4, 20) + 1 * MINUTE, entity: climbedOn(day(2)), objectId: 13 }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.events.length)).toEqual([2, 2])
    expect(groups.every((group) => group.kind === 'session')).toBe(true)
  })

  it('does not let an ascent deleted since bridge two climb days', () => {
    // The middle row has no entity, so no climb date. Comparing against the group's TAIL let it
    // become the oldest member and then match anything, folding Sunday and Saturday into one card
    // claiming to be a single afternoon.
    const groups = groupEvents([
      ascent({ createdAt: day(4, 20) + 2 * MINUTE, entity: climbedOn(day(3)), objectId: 10 }),
      ascent({ createdAt: day(4, 20) + 1 * MINUTE, entity: undefined, objectId: 11 }),
      ascent({ createdAt: day(4, 20), entity: climbedOn(day(2)), objectId: 12 }),
    ])

    expect(groups.map((group) => group.events.map((e) => e.objectId))).toEqual([[10, 11], [12]])
  })

  it('keeps a climb day logged weeks apart out of one session', () => {
    // The other half of the same rule. Same day on the rock, but one ascent remembered three
    // weeks later: joining them would drag a three-week-old event to the top of the feed on a
    // card dated today.
    const groups = groupEvents([
      ascent({ createdAt: day(25, 21), entity: climbedOn(day(2)), objectId: 10 }),
      ascent({ createdAt: day(2, 21), entity: climbedOn(day(2)), objectId: 11 }),
    ])

    expect(groups).toHaveLength(2)
  })

  it('keeps an afternoon together when an ascent deleted since carries no climb date', () => {
    const groups = groupEvents([
      ascent({ createdAt: day(2, 18), entity: climbedOn(day(2)), objectId: 10 }),
      // Deleted, so nothing hydrated and there is no climb date to compare. Splitting the session
      // over a value that is only missing because somebody removed the row is the wrong answer.
      ascent({ createdAt: day(2, 17), entity: undefined, objectId: 11 }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].events).toHaveLength(2)
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

  it('folds the clips of a session onto the session card', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      ascent({ createdAt: noon, objectId: 10 }),
      ascent({ createdAt: noon - MINUTE, objectId: 11 }),
      // One clip on each. Both belong to the same sitting, so both belong on the card that
      // reports it rather than on cards of their own between the session and the feed.
      upload({ createdAt: noon - 2 * MINUTE, objectId: 'f1', parent: { id: 10, type: 'ascent' } }),
      upload({ createdAt: noon - 3 * MINUTE, objectId: 'f2', parent: { id: 11, type: 'ascent' } }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session'])
    expect(groups[0].events).toHaveLength(4)
    // Nothing moved to the front: a session speaks for itself, where a lone create speaks for
    // its whole card and has to lead it.
    expect(groups[0].events.map((event) => event.createdAt)).toEqual([
      noon,
      noon - MINUTE,
      noon - 2 * MINUTE,
      noon - 3 * MINUTE,
    ])
  })

  it('folds a morning clip into a session that ran all day', () => {
    const groups = groupEvents([
      ascent({ createdAt: day(1, 18), objectId: 11 }),
      ascent({ createdAt: day(1, 9), objectId: 10 }),
      // A minute after the climb it hangs on, and nine hours from the card's own timestamp. The
      // merge measures against the CREATE, so the clip lands on the session that logged that climb
      // instead of sitting above it as a card of its own.
      upload({ createdAt: day(1, 9) + MINUTE, objectId: 'f1', parent: { id: 10, type: 'ascent' } }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session'])
    expect(groups[0].events).toHaveLength(3)
  })

  it('leaves a clip added hours after the climb on a card of its own', () => {
    const groups = groupEvents([
      upload({ createdAt: day(1, 21), objectId: 'f1', parent: { id: 10, type: 'ascent' } }),
      ascent({ createdAt: day(1, 8), objectId: 10 }),
    ])

    // Same day, same ascent, thirteen hours apart. A card never moves to its newest event (see
    // `mergeCreatedWithMedia`), so folding this one in would have hidden an upload the reader just
    // made behind a card dated that morning, where the feed had already carried it past.
    expect(groups.map((group) => group.kind)).toEqual(['single', 'single'])
    expect(groups[0].createdAt).toBe(day(1, 21))
  })

  it('keeps a submit of photos out of an edit burst that created two routes', () => {
    const noon = day(1, 12)
    const groups = groupEvents([
      upload({ createdAt: noon, objectId: 'f1', parent: { id: 50, type: 'route' } }),
      event({ createdAt: noon - MINUTE, objectId: 50, parent: { id: 7, type: 'block' }, verb: 'create' }),
      event({ createdAt: noon - 2 * MINUTE, objectId: 51, parent: { id: 7, type: 'block' }, verb: 'create' }),
    ])

    // A burst is keyed on the place rather than on one sitting's climbs, so a card that merged
    // the photos in would hide them inside "edited Nordblock". Only a session takes several.
    expect(groups.map((group) => group.kind)).toEqual(['single', 'burst'])
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
