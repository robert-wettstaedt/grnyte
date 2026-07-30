import { describe, expect, it } from 'vitest'
import type { ActivityDto } from './dto'
import { groupActivities } from './grouping'

const MINUTE = 60 * 1000
const day = (n: number, hour = 12) => new Date(2026, 0, n, hour).getTime()

let nextId = 0
function activity(partial: Partial<ActivityDto>): ActivityDto {
  return {
    columnName: undefined,
    createdAt: day(1),
    entityId: '1',
    entityType: 'route',
    id: ++nextId,
    metadata: undefined,
    newValue: undefined,
    oldValue: undefined,
    parentEntityId: undefined,
    parentEntityType: undefined,
    regionFk: 1,
    type: 'updated',
    userFk: 1,
    userName: 'ada',
    ...partial,
  }
}

const ascent = (partial: Partial<ActivityDto> = {}) =>
  activity({ entityType: 'ascent', parentEntityType: 'route', type: 'created', ...partial })

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
      // Written against the ascent, but it is media housekeeping, not a tick.
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

  it('returns nothing for no activities', () => {
    expect(groupActivities([])).toEqual([])
  })
})
