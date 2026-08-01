import { describe, expect, it } from 'vitest'
import type { ActivityDto } from './dto'
import { activityEntityRefs } from './entity'

function activity(partial: Partial<ActivityDto>): ActivityDto {
  return {
    columnName: undefined,
    createdAt: 0,
    entityId: '1',
    entityType: 'route',
    id: 1,
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

describe('activityEntityRefs', () => {
  it('lists each entity once, in the order the activities arrive', () => {
    expect(
      activityEntityRefs([
        activity({ entityId: '2', id: 1 }),
        activity({ entityId: '3', id: 2 }),
        activity({ entityId: '2', id: 3 }),
        activity({ entityId: '2', entityType: 'block', id: 4 }),
      ]),
    ).toEqual([
      { id: '2', type: 'route' },
      { id: '3', type: 'route' },
      { id: '2', type: 'block' },
    ])
  })
})
