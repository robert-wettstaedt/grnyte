import { hasMessage } from '$lib/i18n/message'
import { describe, expect, it } from 'vitest'
import type { ActivityDto } from './dto'
import { activityFields } from './fields'
import { activityVerbKeys } from './verbs'
import { WRITTEN_ACTIVITIES } from './written'

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

describe('activityVerbKeys', () => {
  it('degrades a column-scoped update to the column-less verb', () => {
    expect(activityVerbKeys(activity({ columnName: 'gradeFk' }))).toEqual([
      'activity_routeUpdatedGradeFk',
      'activity_routeUpdated',
    ])
  })

  it('camel cases a spaced column name', () => {
    expect(activityVerbKeys(activity({ columnName: 'parking location', entityType: 'area' }))).toEqual([
      'activity_areaUpdatedParkingLocation',
      'activity_areaUpdated',
    ])
  })

  it('never degrades a column-scoped delete to "deleted the entity"', () => {
    // A removed photo must not fall back to `activity_routeDeleted`: the route is still there.
    expect(activityVerbKeys(activity({ columnName: 'file', type: 'deleted' }))).toEqual(['activity_routeDeletedFile'])
    expect(activityVerbKeys(activity({ columnName: 'parking location', entityType: 'area', type: 'deleted' }))).toEqual(
      ['activity_areaDeletedParkingLocation'],
    )
  })

  it('uses the whole-entity verb when nothing scopes the change', () => {
    expect(activityVerbKeys(activity({ type: 'deleted' }))).toEqual(['activity_routeDeleted'])
  })

  it('reads a new ascent s verb from its ascent type rather than a column', () => {
    expect(activityVerbKeys(activity({ entityType: 'ascent', newValue: 'flash', type: 'created' }))).toEqual([
      'activity_ascentCreatedFlash',
      'activity_ascentCreated',
    ])
  })
})

describe('activity verbs', () => {
  it('has a message for every activity the mutation layer writes', () => {
    const missing = WRITTEN_ACTIVITIES.map((partial) => activityVerbKeys(activity(partial))).filter(
      (keys) => !keys.some(hasMessage),
    )

    expect(missing).toEqual([])
  })
})

describe('activityFields', () => {
  it('has a message for every field label', () => {
    const missing = Object.values(activityFields)
      .map((field) => field.labelKey)
      .filter((key) => !hasMessage(key))

    expect(missing).toEqual([])
  })
})
