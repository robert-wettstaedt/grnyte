import { describe, expect, it } from 'vitest'
import { withSearchParams } from './navigation.svelte'

const feed = (search = '') => new URL(`https://grnyte.rocks/feed${search}`)

describe('withSearchParams', () => {
  it('writes the values it is given', () => {
    expect(withSearchParams(feed(), { category: 'ascent', region: 2 }).search).toBe('?category=ascent&region=2')
  })

  it('drops a param whose value is absent or empty', () => {
    const url = withSearchParams(feed('?category=ascent&region=2&user='), {
      category: undefined,
      region: 2,
      user: '',
    })

    expect(url.search).toBe('?region=2')
  })

  it('keeps params it was not given, in place', () => {
    const url = withSearchParams(feed('?ref=mail&region=2&utm=x'), { region: 3 })

    expect(url.search).toBe('?ref=mail&region=3&utm=x')
  })

  it('leaves the query untouched when nothing changes, and never writes through the source', () => {
    const url = feed('?ref=mail&region=2')

    expect(withSearchParams(url, { region: 2 }).search).toBe('?ref=mail&region=2')
    expect(withSearchParams(url, { region: 9 }).search).toBe('?ref=mail&region=9')

    expect(url.search).toBe('?ref=mail&region=2')
  })

  // The regression this function exists for. `syncSearchParams` writes whenever the built query
  // differs from the browser's, so a query that does not survive its own round trip replaces
  // state forever. A space is the cheapest way to catch it (`%20` hand-encoded, `+` from
  // `URLSearchParams`), the quote and parens the ones a hand-rolled encoder also disagrees on.
  it.each(['?ref=my link', "?ref=o'neill (2)", '?ref=a~b!c*d'])('round trips %s as a fixed point', (search) => {
    const once = withSearchParams(feed(search), { region: 2 })
    const twice = withSearchParams(once, { region: 2 })

    expect(twice.search).toBe(once.search)
    // The property `syncSearchParams` actually guards on: what it builds is already in the one
    // serialisation the browser hands back, so the second pass has nothing to write. Asserted
    // against `URLSearchParams` rather than against `new URL(once)`, which only re-parses a
    // string WHATWG already guarantees is a fixed point and so can never fail.
    expect(once.search).toBe(`?${new URLSearchParams(once.search).toString()}`)
  })

  // The flip side of that normalisation, and the reason the doc comment warns about it: a write
  // re-serialises the whole query, so params this call never named are rewritten too.
  it('normalises the params it was not given', () => {
    const url = withSearchParams(feed('?ref=my%20link&debug'), { region: 2 })

    expect(url.search).toBe('?ref=my+link&debug=&region=2')
  })
})
