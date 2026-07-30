import { overwriteGetLocale } from '$lib/paraglide/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { splitMessage } from './message'

afterEach(() => overwriteGetLocale(() => 'en'))

describe('splitMessage', () => {
  it('cuts a message around the placeholders the caller renders itself', () => {
    expect(splitMessage('activity_routeCreated', { person: 'other' }, ['actor', 'name'])).toEqual([
      { part: 'actor' },
      { text: ' added the route ' },
      { part: 'name' },
    ])
  })

  /**
   * The reason this helper exists. German puts the participle after the object, so the
   * segments come back in a different order than English and markup cannot hard-code one.
   */
  it('follows the translation s word order, not the call site s', () => {
    overwriteGetLocale(() => 'de')

    expect(splitMessage('activity_routeCreated', { person: 'other' }, ['actor', 'name'])).toEqual([
      { part: 'actor' },
      { text: ' hat die Route ' },
      { part: 'name' },
      { text: ' hinzugefügt' },
    ])
  })

  it('conjugates around the actor for your own activity', () => {
    overwriteGetLocale(() => 'de')

    // "Du hast" against "{actor} hat": one string cannot serve both, hence the person variant.
    expect(splitMessage('activity_routeCreated', { person: 'self' }, ['actor', 'name'])).toEqual([
      { text: 'Du hast die Route ' },
      { part: 'name' },
      { text: ' hinzugefügt' },
    ])
  })

  it('renders an unknown key as the key rather than blank copy', () => {
    expect(splitMessage('activity_nope', {}, ['actor'])).toEqual([{ text: 'activity_nope' }])
  })
})
