import { describe, expect, it } from 'vitest'
import type { ActivityDto } from './dto'
import { activityEntityName, activityEntityRefs, activityParentRef } from './entity'

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

describe('activityParentRef', () => {
  it('names the parent every row agrees on', () => {
    const rows = [
      activity({ entityId: '1', parentEntityId: '400', parentEntityType: 'block' }),
      activity({ entityId: '2', parentEntityId: '400', parentEntityType: 'block' }),
    ]

    expect(activityParentRef(rows)).toEqual({ id: '400', type: 'block' })
  })

  it('has no parent when the rows disagree, or carry none', () => {
    expect(
      activityParentRef([
        activity({ parentEntityId: '400', parentEntityType: 'block' }),
        activity({ parentEntityId: '401', parentEntityType: 'block' }),
      ]),
    ).toBeUndefined()

    expect(activityParentRef([activity({})])).toBeUndefined()
  })
})

describe('activityEntityName', () => {
  const entity = { name: 'Rampe', row: 'route' as const }

  it('prefers the hydrated entity', () => {
    expect(activityEntityName(activity({ oldValue: 'Altweg', type: 'deleted' }), entity)).toBe('Rampe')
  })

  it('falls back to the name a create or delete row stashed', () => {
    expect(activityEntityName(activity({ newValue: 'Neuweg', type: 'created' }), null)).toBe('Neuweg')
    expect(activityEntityName(activity({ oldValue: 'Altweg', type: 'deleted' }), null)).toBe('Altweg')
  })

  it('never borrows a column value that is not a name', () => {
    // A grade id in the headline would read as "changed the grade of 15".
    expect(activityEntityName(activity({ columnName: 'gradeFk', newValue: '15' }), undefined)).toBeUndefined()
    expect(activityEntityName(activity({ columnName: 'name', newValue: 'Kante direkt' }), undefined)).toBe(
      'Kante direkt',
    )
  })

  it('never reads an ascent row, whose values are tick types', () => {
    expect(
      activityEntityName(activity({ entityType: 'ascent', newValue: 'flash', type: 'created' }), undefined),
    ).toBeUndefined()
  })

  it('borrows a user row s value, which is the person', () => {
    expect(
      activityEntityName(
        activity({ columnName: 'invitation', entityType: 'user', newValue: 'sofia@example.com', type: 'created' }),
        undefined,
      ),
    ).toBe('sofia@example.com')
  })
})
