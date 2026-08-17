import { overwriteGetLocale } from '$lib/paraglide/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { splitMessage, type MessageKey } from './message'

afterEach(() => overwriteGetLocale(() => 'en'))

describe('splitMessage', () => {
  it('cuts a message around the placeholders the caller renders itself', () => {
    expect(splitMessage('event_routeCreated', { person: 'other' }, ['actor', 'name'])).toEqual([
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

    expect(splitMessage('event_routeCreated', { person: 'other' }, ['actor', 'name'])).toEqual([
      { part: 'actor' },
      { text: ' hat die Route ' },
      { part: 'name' },
      { text: ' hinzugefügt' },
    ])
  })

  it('conjugates around the actor for your own activity', () => {
    overwriteGetLocale(() => 'de')

    // "Du hast" against "{actor} hat": one string cannot serve both, hence the person variant.
    expect(splitMessage('event_routeCreated', { person: 'self' }, ['actor', 'name'])).toEqual([
      { text: 'Du hast die Route ' },
      { part: 'name' },
      { text: ' hinzugefügt' },
    ])
  })

  it('renders an unknown key as the key rather than blank copy', () => {
    // The cast is the point: `MessageKey` makes this unreachable except where a caller casts
    // deliberately, which `card.ts` does for a verb chain that matched nothing.
    expect(splitMessage('event_nope' as MessageKey, {}, ['actor'])).toEqual([{ text: 'event_nope' }])
  })
})
