import { describe, expect, it } from 'vitest'
import { activityEntityRefs } from './entity'
import { activity } from './fixture'

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
