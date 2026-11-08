import { describe, expect, it } from 'vitest'
import { offlinePolicyOf } from './offline'

describe('offlinePolicyOf', () => {
  it('excludes the screens served elsewhere and claims nothing for the rest', () => {
    expect(['listComments', 'listEvents', 'listNotifications', 'listRouteAscents'].map(offlinePolicyOf)).toEqual(
      Array(4).fill('excluded'),
    )
    expect([offlinePolicyOf('ascent'), offlinePolicyOf(undefined)]).toEqual([undefined, undefined])
  })
})
