import { describe, expect, it } from 'vitest'
import type { ActivityListItem } from './dto'
import { activity } from './fixture'
import { groupActivities } from './grouping'

const MINUTE = 60 * 1000
const day = (n: number, hour = 12) => new Date(2026, 0, n, hour).getTime()

const ascent = (partial: Partial<ActivityListItem> = {}) =>
  activity({ entityType: 'ascent', parentEntityType: 'route', type: 'created', ...partial })

/** Crag edits under one block, the locality a burst keys on. */
const underBlock = { parentEntityId: '400', parentEntityType: 'block' } as const

/** An upload: the row points at the file, and names what it landed on as its parent. */
const upload = (partial: Partial<ActivityListItem> = {}) =>
  activity({ entityType: 'file', type: 'uploaded', ...underBlock, ...partial })

describe('groupActivities', () => {
  it('groups one climber s ascents from the same day into a session', () => {
    const groups = groupActivities([
      ascent({ createdAt: day(2, 18), entityId: '10' }),
      ascent({ createdAt: day(2, 9), entityId: '11' }),
      // Same climber, previous day: its own card.
      ascent({ createdAt: day(1, 10), entityId: '12' }),
      // Same day, different climber: their own session.
      ascent({ createdAt: day(2, 11), entityId: '13', userFk: 2 }),
      ascent({ createdAt: day(2, 10), entityId: '14', userFk: 2 }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session', 'session', 'single'])
    expect(groups[0].activities.map((a) => a.entityId)).toEqual(['10', '11'])
    expect(groups[0].userFk).toBe(1)
    expect(groups[1].userFk).toBe(2)
  })

  it('groups one editor s crag edits under the same parent into a burst, and splits on the window', () => {
    const noon = day(1, 12)
    const groups = groupActivities([
      activity({ createdAt: noon, entityId: '1', parentEntityId: '7', parentEntityType: 'block' }),
      activity({ createdAt: noon - 5 * MINUTE, entityId: '2', parentEntityId: '7', parentEntityType: 'block' }),
      // Same parent but an hour earlier: out of the 30 minute window.
      activity({ createdAt: noon - 60 * MINUTE, entityId: '3', parentEntityId: '7', parentEntityType: 'block' }),
      // In the window, but a different parent block.
      activity({ createdAt: noon - 2 * MINUTE, entityId: '4', parentEntityId: '8', parentEntityType: 'block' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['burst', 'single', 'single'])
    expect(groups[0].activities.map((a) => a.entityId)).toEqual(['1', '2'])
    expect(groups[1].activities.map((a) => a.entityId)).toEqual(['4'])
  })

  it('keeps whole entity deletions out of the burst they would read as edits in', () => {
    const noon = day(1, 12)
    const groups = groupActivities([
      activity({ createdAt: noon, entityId: '1', type: 'deleted', ...underBlock }),
      activity({ createdAt: noon - MINUTE, entityId: '2', type: 'deleted', ...underBlock }),
      activity({ createdAt: noon - 2 * MINUTE, entityId: '1', ...underBlock }),
      // A column scoped delete really is an edit: the entity is still there, its photo is not.
      activity({ columnName: 'file', createdAt: noon - 3 * MINUTE, entityId: '2', type: 'deleted', ...underBlock }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['removal', 'burst'])
    expect(groups[0].activities.map((a) => a.entityId)).toEqual(['1', '2'])
    expect(groups[1].activities.map((a) => a.entityId)).toEqual(['1', '2'])
  })

  it('groups anyone s edits to the same non crag entity by entity', () => {
    const groups = groupActivities([
      activity({ columnName: 'role', createdAt: day(1, 12), entityId: '5', entityType: 'user', userFk: 1 }),
      activity({ columnName: 'role', createdAt: day(1, 12) - MINUTE, entityId: '5', entityType: 'user', userFk: 2 }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('entity')
    // Mixed actors: the card credits the newest one.
    expect(groups[0].userFk).toBe(1)
  })

  it('sorts newest first and dates a group by its newest activity', () => {
    const groups = groupActivities([
      activity({ createdAt: day(1, 9), entityId: '1' }),
      ascent({ createdAt: day(3), entityId: '2' }),
      activity({ createdAt: day(2), entityId: '3' }),
    ])

    expect(groups.map((group) => group.createdAt)).toEqual([day(3), day(2), day(1, 9)])
  })

  it('keeps a log that runs past midnight in one session', () => {
    const groups = groupActivities([
      ascent({ createdAt: day(2, 0) + 4 * MINUTE, entityId: '10' }),
      ascent({ createdAt: day(1, 23) + 56 * MINUTE, entityId: '11' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('session')
  })

  it('keeps a photo pulled off an ascent out of the session card', () => {
    const groups = groupActivities([
      ascent({ createdAt: day(1, 12), entityId: '10' }),
      ascent({ createdAt: day(1, 11), entityId: '11' }),
      // Written against the ascent, but it is media housekeeping, not an ascent.
      activity({ columnName: 'file', createdAt: day(1, 10), entityId: '12', entityType: 'ascent', type: 'deleted' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['session', 'single'])
    expect(groups[0].activities).toHaveLength(2)
  })

  it('keeps a card s id when a newer activity joins it', () => {
    const older = activity({ createdAt: day(1, 12), entityId: '1', parentEntityId: '7', parentEntityType: 'block' })
    const newer = activity({
      createdAt: day(1, 12) + MINUTE,
      entityId: '2',
      parentEntityId: '7',
      parentEntityType: 'block',
    })

    const before = groupActivities([older])
    const after = groupActivities([newer, older])

    expect(after[0].activities).toHaveLength(2)
    expect(after[0].id).toBe(before[0].id)
  })

  it('folds one submit s uploads into a single card, on the entity they landed on', () => {
    // Every row points at its own file id, so without grouping on the parent this is five
    // cards. That is the whole reason `upload` is a kind of its own.
    const groups = groupActivities(
      Array.from({ length: 5 }, (_, index) =>
        upload({ createdAt: day(1, 12) - index * MINUTE, entityId: `file-${index}` }),
      ),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('upload')
    expect(groups[0].activities).toHaveLength(5)
  })

  it('keeps uploads out of the editor s crag burst', () => {
    // Same actor, same block, same minute. Folding them together would title five photos
    // as "made 7 edits" and bury them.
    const groups = groupActivities([
      upload({ createdAt: day(1, 12), entityId: 'file-1' }),
      upload({ createdAt: day(1, 12) - MINUTE, entityId: 'file-2' }),
      activity({ columnName: 'name', createdAt: day(1, 12) - 2 * MINUTE, entityId: '1', ...underBlock }),
      activity({ columnName: 'rating', createdAt: day(1, 12) - 3 * MINUTE, entityId: '2', ...underBlock }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['upload', 'burst'])
  })

  // Pasting the link while adding the clip writes a source row that says nothing the upload
  // row does not, and setting the source during the upload itself writes no second row at all.
  it('drops a source edit that landed with the upload it is about', () => {
    const groups = groupActivities([
      upload({ createdAt: day(1, 12), entityId: 'file-1' }),
      upload({ createdAt: day(1, 12) - MINUTE, entityId: 'file-2' }),
      activity({
        columnName: 'source',
        createdAt: day(1, 12) - 2 * MINUTE,
        entityId: 'file-1',
        entityType: 'file',
        ...underBlock,
      }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['upload'])
    expect(groups[0].activities).toHaveLength(2)
  })

  // Only the row that set a source the file never had is redundant. Fixing a credit five
  // minutes after uploading is a deliberate edit, and dropping it on the timestamp alone hid
  // the one thing the climber went back to say.
  it('keeps a source correction that landed inside the upload window', () => {
    const groups = groupActivities([
      activity({
        columnName: 'source',
        createdAt: day(1, 12),
        entityId: 'file-1',
        entityType: 'file',
        newValue: 'https://vimeo.com/2',
        oldValue: 'https://youtube.com/1',
        ...underBlock,
      }),
      upload({ createdAt: day(1, 12) - 5 * MINUTE, entityId: 'file-1' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['single', 'single'])
    expect(groups[0].activities.map((entry) => entry.columnName)).toEqual(['source'])
  })

  // A credit corrected later is its own event, and must not fold into the upload card either:
  // "added 3 photos" would swallow it.
  it('keeps a source edit made after the upload window as its own card', () => {
    const groups = groupActivities([
      activity({
        columnName: 'source',
        createdAt: day(1, 12),
        entityId: 'file-1',
        entityType: 'file',
        ...underBlock,
      }),
      upload({ createdAt: day(1, 12) - 45 * MINUTE, entityId: 'file-1' }),
      upload({ createdAt: day(1, 12) - 46 * MINUTE, entityId: 'file-2' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['single', 'upload'])
    expect(groups[0].activities.map((a) => a.columnName)).toEqual(['source'])
  })

  // Adding a route with photos is one event. Nothing in the keys can join the halves: the
  // create keys on the block, the uploads key on the route.
  it('folds an upload into the create of the thing it landed on', () => {
    const groups = groupActivities([
      upload({ createdAt: day(1, 12), entityId: 'file-1', parentEntityId: '9', parentEntityType: 'route' }),
      upload({ createdAt: day(1, 12) - MINUTE, entityId: 'file-2', parentEntityId: '9', parentEntityType: 'route' }),
      activity({
        createdAt: day(1, 12) - 2 * MINUTE,
        entityId: '9',
        newValue: 'Kante',
        type: 'created',
        ...underBlock,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].activities).toHaveLength(3)
    // The create leads, so the card speaks its verb rather than the newer uploads'.
    expect(groups[0].activities[0].type).toBe('created')
  })

  // A session is three things done, and the clip hangs off one of them. Folding it in made the
  // card speak that one ascent's verb and count "1 video" for an afternoon of three ascents.
  it('leaves a session alone when a clip landed on one of its ascents', () => {
    const groups = groupActivities([
      upload({ createdAt: day(1, 12), entityId: 'file-1', parentEntityId: '9002', parentEntityType: 'ascent' }),
      ascent({ createdAt: day(1, 12) - MINUTE, entityId: '9003', parentEntityId: '500' }),
      ascent({ createdAt: day(1, 12) - 2 * MINUTE, entityId: '9002', parentEntityId: '501' }),
      ascent({ createdAt: day(1, 12) - 3 * MINUTE, entityId: '9001', parentEntityId: '502' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['single', 'session'])
    expect(groups[1].activities).toHaveLength(3)
  })

  // The merge only ever had one create to speak for, so the rows after it stay in the order
  // the rest of the feed reads in. A newer edit landing behind the uploads rendered the change
  // list out of order.
  it('keeps a merged group chronological after the create it leads with', () => {
    const groups = groupActivities([
      activity({ columnName: 'name', createdAt: day(1, 12), entityId: '9', ...underBlock }),
      upload({ createdAt: day(1, 12) - MINUTE, entityId: 'file-1', parentEntityId: '9', parentEntityType: 'route' }),
      activity({
        createdAt: day(1, 12) - 2 * MINUTE,
        entityId: '9',
        newValue: 'Kante',
        type: 'created',
        ...underBlock,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].activities.map((entry) => entry.type)).toEqual(['created', 'updated', 'uploaded'])
  })

  // The id keys on the oldest row so a card keeps its expand state as newer rows join. Reading
  // the last position instead re-keyed exactly the cards the merge reordered.
  it('keys a merged card on its oldest row, not on whatever sits last', () => {
    const create = activity({
      createdAt: day(1, 12) - 2 * MINUTE,
      entityId: '9',
      newValue: 'Kante',
      type: 'created',
      ...underBlock,
    })
    const photo = upload({
      createdAt: day(1, 12) - MINUTE,
      entityId: 'file-1',
      parentEntityId: '9',
      parentEntityType: 'route',
    })

    const [merged] = groupActivities([photo, create])
    const [alone] = groupActivities([create])

    expect(merged.id).toBe(alone.id)
  })

  it('leaves uploads alone when nothing created their parent nearby', () => {
    const groups = groupActivities([
      upload({ createdAt: day(1, 12), entityId: 'file-1', parentEntityId: '9', parentEntityType: 'route' }),
      activity({ columnName: 'name', createdAt: day(1, 12) - MINUTE, entityId: '9', ...underBlock }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['single', 'single'])
  })

  // The same person is the same id in every region they belong to, so a user row without the
  // region folded two unrelated role changes into one card that reported neither.
  it('never folds two regions into one card', () => {
    const groups = groupActivities([
      activity({ columnName: 'role', createdAt: day(1, 12), entityId: '5', entityType: 'user', regionFk: 1 }),
      activity({ columnName: 'role', createdAt: day(1, 12) - MINUTE, entityId: '5', entityType: 'user', regionFk: 2 }),
    ])

    expect(groups).toHaveLength(2)
  })

  it('separates uploads by the entity they landed on', () => {
    const groups = groupActivities([
      upload({ createdAt: day(1, 12), entityId: 'file-1' }),
      upload({ createdAt: day(1, 12) - MINUTE, entityId: 'file-2', parentEntityId: '401' }),
    ])

    expect(groups).toHaveLength(2)
  })

  it('returns nothing for no activities', () => {
    expect(groupActivities([])).toEqual([])
  })
})
