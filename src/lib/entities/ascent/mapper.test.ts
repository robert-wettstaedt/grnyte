import { locationCrumb } from '$lib/components/Profile/crumbs'
import { m } from '$lib/paraglide/messages'
import { describe, expect, it } from 'vitest'
import { toUserAscentDetail, type UserAscentDetailRow } from './mapper'

/**
 * The row type is generated off a Zero query, so a literal cannot satisfy it structurally.
 * One cast, over exactly the fields the two display-name fallbacks read.
 */
const row = (route: null | { block?: null | { area?: { name: string }; name: string; order: number }; name: string }) =>
  ({
    createdBy: 1,
    dateTime: 0,
    files: [],
    gradeFk: null,
    humidity: null,
    id: 1,
    notes: '',
    rating: null,
    regionFk: 1,
    route: route == null ? null : { userGradeFk: null, ...route },
    routeFk: 7,
    temperature: null,
    type: 'redpoint',
  }) as unknown as UserAscentDetailRow

describe('toUserAscentDetail', () => {
  // The bug this covers: `routeName` used to be `row.route?.name ?? ''`, so a nameless route
  // rendered as an empty link in the profile's logbook row, leaving the ascent-type badge
  // alone on its line, and named nothing in the delete confirmation. Meanwhile a `!routes:n!`
  // reference in the same row's note resolved through `toDisplayName` and DID show the
  // placeholder, so one screen disagreed with itself about what a nameless route is called.
  it('names a route with no name', () => {
    expect(toUserAscentDetail(row({ name: '' })).routeName).toBe(m.common_unnamed())
  })

  it('leaves a real route name alone', () => {
    expect(toUserAscentDetail(row({ name: 'Arch Nemesis' })).routeName).toBe('Arch Nemesis')
  })

  // Padding is not part of the name, and in a truncating row it eats characters that would
  // otherwise have fit.
  it('trims the name it returns', () => {
    expect(toUserAscentDetail(row({ name: '  Arch Nemesis  ' })).routeName).toBe('Arch Nemesis')
    const detail = toUserAscentDetail(row({ block: { name: ' Le Toit ', order: 0 }, name: 'x' }))
    expect(detail.blockName).toBe('Le Toit')
  })

  // Whitespace, not just empty. Names are trimmed on write, but imported and legacy rows are
  // not, and "   " renders as a blank link exactly like "".
  it('names a whitespace-only route', () => {
    expect(toUserAscentDetail(row({ name: '   ' })).routeName).toBe(m.common_unnamed())
  })

  it('names a route the row has lost entirely', () => {
    expect(toUserAscentDetail(row(null)).routeName).toBe(m.common_unnamed())
  })

  it('numbers a block with no name by its position', () => {
    const detail = toUserAscentDetail(row({ block: { name: '', order: 2 }, name: 'Arch Nemesis' }))
    expect(detail.blockName).toBe(`${m.common_block()} 3`)
  })

  it('leaves a real block name alone', () => {
    const detail = toUserAscentDetail(row({ block: { name: 'Le Toit', order: 0 }, name: 'Arch Nemesis' }))
    expect(detail.blockName).toBe('Le Toit')
  })

  it('numbers a whitespace-only block by its position', () => {
    const detail = toUserAscentDetail(row({ block: { name: '  ', order: 4 }, name: 'Arch Nemesis' }))
    expect(detail.blockName).toBe(`${m.common_block()} 5`)
  })

  // Distinct from an unnamed block: the crumb drops the part rather than inventing one.
  it('has no block name when the ascent has no block', () => {
    expect(toUserAscentDetail(row({ block: null, name: 'Arch Nemesis' })).blockName).toBeUndefined()
  })

  it('carries the area name through for the crumb', () => {
    const detail = toUserAscentDetail(
      row({ block: { area: { name: 'Roadside' }, name: 'Le Toit', order: 0 }, name: 'Arch Nemesis' }),
    )
    expect(detail.areaName).toBe('Roadside')
  })

  it('names a nameless area for the crumb instead of dropping it', () => {
    // `areaName` came off the row raw and `locationCrumb` filtered `name !== ''`, so a nameless
    // area vanished from the trail. Whitespace, because that survived the filter as spaces.
    const detail = toUserAscentDetail(
      row({ block: { area: { name: '   ' }, name: 'Le Toit', order: 0 }, name: 'Arch Nemesis' }),
    )

    expect(detail.areaName).toBe(m.common_unnamed())
    expect(locationCrumb(detail)).toEqual([m.common_unnamed(), 'Le Toit'])
  })
})
