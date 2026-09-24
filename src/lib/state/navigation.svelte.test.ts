import { afterEach, describe, expect, it, vi } from 'vitest'
import { withSearchParams } from './navigation.svelte'

const feed = (search = '') => new URL(`https://grnyte.rocks/feed${search}`)
const at = (path: string) => new URL(`https://grnyte.rocks${path}`)

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
    // The property `syncSearchParams` guards on: what it builds is already in the one
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

/**
 * The classification `trackHistoryDepth` computes, asserted at the call site rather than on a
 * helper: the point of the change is that the trail and the scroll rule read ONE answer, and a test
 * of an extracted classifier would still pass if the call site stopped sharing it.
 *
 * `canGoBack()` stands in for what the trail recorded, since `trail` is module-internal: only a
 * `push` adds an entry a back press could reach.
 */
describe('trackHistoryDepth', () => {
  const load = async () => {
    vi.resetModules()

    // `from` and `from.url` are BOTH nullable in Kit's own types, and the real first navigation of
    // a document supplies `from.url: null`. A fixture that always hands over a URL cannot see that.
    let handler:
      | ((navigation: { delta?: number; from?: null | { url: null | URL }; to: { url: URL }; type: string }) => void)
      | undefined
    const onNavigation = vi.fn()

    vi.doMock('$app/navigation', () => ({
      afterNavigate: (callback: typeof handler) => void (handler = callback),
      goto: () => Promise.resolve(),
      replaceState: () => undefined,
    }))
    vi.doMock('./scroll', () => ({ onNavigation }))

    const navigation = await import('./navigation.svelte')
    navigation.trackHistoryDepth()

    return {
      arrive: (type: string, { from = '/blocks/1' as null | string, to = '/feed' } = {}) =>
        handler?.({ from: { url: from == null ? null : at(from) }, to: { url: at(to) }, type }),
      arriveWithoutOrigin: (type: string, to = '/feed') => handler?.({ to: { url: at(to) }, type }),
      navigation,
      onNavigation,
    }
  }

  afterEach(() => vi.doUnmock('$app/navigation'))

  it('reports a link navigation as a push, to both readers', async () => {
    const { arrive, navigation, onNavigation } = await load()

    arrive('enter')
    arrive('link')

    expect(onNavigation).toHaveBeenLastCalledWith('push', false)
    expect(navigation.canGoBack()).toBe(true)
  })

  it('reports a replaceUrl navigation as a replace, to both readers', async () => {
    const { arrive, navigation, onNavigation } = await load()

    arrive('enter')
    void navigation.replaceUrl('/profile')
    // The arrival has to BE the one the replace was headed for; the record is matched by destination.
    arrive('goto', { from: '/feed', to: '/profile' })

    expect(onNavigation).toHaveBeenLastCalledWith('replace', false)
    // A replace swapped the entry rather than adding one, so there is still nothing behind.
    expect(navigation.canGoBack()).toBe(false)
  })

  it.each(['enter', 'popstate'])('passes %s through unchanged', async (type) => {
    const { arrive, onNavigation } = await load()

    arrive(type)

    expect(onNavigation).toHaveBeenLastCalledWith(type, false)
  })

  // `openMedia` pushes `?media=` onto the CURRENT screen so back closes it. A rule reading the kind
  // alone would reset the screen behind the viewer, which is what driving it caught.
  it('marks a query-only push as staying on the same screen', async () => {
    const { arrive, onNavigation } = await load()

    arrive('enter')
    arrive('link', { from: '/blocks/8660', to: '/blocks/8660' })

    expect(onNavigation).toHaveBeenLastCalledWith('push', true)
  })

  // The crash this guards: `navigation.from.url` is null on a document's first navigation, and an
  // unguarded `.pathname` threw inside `afterNavigate`, which left Kit's client router dead so every
  // link fell back to a full page load.
  it('survives a first navigation that has no origin url', async () => {
    const { arrive, onNavigation } = await load()

    expect(() => arrive('enter', { from: null })).not.toThrow()
    expect(onNavigation).toHaveBeenLastCalledWith('enter', false)
  })

  it('survives a navigation with no `from` at all', async () => {
    const { arriveWithoutOrigin, onNavigation } = await load()

    expect(() => arriveWithoutOrigin('enter')).not.toThrow()
    expect(onNavigation).toHaveBeenLastCalledWith('enter', false)
  })

  // An unknown origin must read as a DIFFERENT screen: two nullish pathnames compare equal, which
  // would suppress the reset on the first push after a cold start.
  it('treats a push with an unknown origin as a screen change', async () => {
    const { arrive, onNavigation } = await load()

    arrive('enter', { from: null })
    arrive('link', { from: null })

    expect(onNavigation).toHaveBeenLastCalledWith('push', false)
  })

  // A resolver forwards from an `$effect` during its own mount, so the redirect is registered BEFORE
  // that mount's own navigation reaches `afterNavigate`. A boolean flag is consumed by the wrong one:
  // driven, /ascents/68 arrived at the list classified `push` with no exemption, and the reset wiped
  // the row the deep link existed to show.
  it('exempts a redirect even when another navigation lands first', async () => {
    const { arrive, navigation, onNavigation } = await load()

    void navigation.redirectTo('/routes/108/ascents?ascent=68')

    // The mount's own navigation settles in between and must not consume the redirect.
    arrive('enter', { from: null, to: '/ascents/68' })
    expect(onNavigation).toHaveBeenLastCalledWith('enter', false)

    arrive('goto', { from: '/ascents/68', to: '/routes/108/ascents' })

    // Asserted on the exemption alone, deliberately. The KIND arrives as `push` rather than
    // `replace`, because `replacing` is a boolean consumed by that same intervening navigation, so
    // the trail records a pushed entry for a replaceState. That is a pre-existing defect in the
    // back-navigation bookkeeping, not this rule's, and pinning `push` here would enshrine it.
    expect(onNavigation.mock.lastCall?.[1], 'the redirect is exempt from the reset').toBe(true)
  })

  // The exemption is spent once, so the next arrival at that screen is an ordinary screen change.
  it('does not exempt a later navigation to the same screen', async () => {
    const { arrive, navigation, onNavigation } = await load()

    void navigation.redirectTo('/routes/108/ascents?ascent=68')
    arrive('goto', { from: '/ascents/68', to: '/routes/108/ascents' })
    arrive('link', { from: '/feed', to: '/routes/108/ascents' })

    expect(onNavigation.mock.lastCall?.[1], 'the exemption was spent by the redirect').toBe(false)
  })

  // A redirect that never arrives must not outlive the next navigation. Clearing it when the `goto`
  // settles looks equivalent and is not: measured, that settles BEFORE the redirect's own
  // `afterNavigate`, so it would wipe the exemption just before it is read.
  it('discards a redirect that never arrived once the reader lands elsewhere', async () => {
    const { arrive, navigation, onNavigation } = await load()

    void navigation.redirectTo('/routes/108/ascents?ascent=68')
    // The resolver's own mount, which the record has to survive.
    arrive('enter', { from: null, to: '/ascents/68' })
    // The redirect never arrives; the reader goes somewhere else instead.
    arrive('link', { from: '/ascents/68', to: '/feed' })
    // Now the destination is reached by an ordinary push, which is a real screen change.
    arrive('link', { from: '/feed', to: '/routes/108/ascents' })

    expect(onNavigation.mock.lastCall?.[1], 'the stale exemption was discarded').toBe(false)
  })

  /**
   * The race that makes back dead on a resolver deep link. `replaceUrl` clears `replacing` when the
   * `goto` settles, and that settlement can beat the navigation's own `afterNavigate`. Measured once
   * in a real browser, but it is a race and usually resolves the safe way, so driving it is not
   * reliable. Awaiting the settlement here makes the adverse order deterministic.
   */
  it('records a replace whose goto settled before the navigation arrived', async () => {
    const { arrive, navigation, onNavigation } = await load()

    arrive('enter', { from: null, to: '/ascents/68' })

    const done = navigation.replaceUrl('/routes/108/ascents?ascent=68')
    // The settlement wins the race, which is what clears the flag early.
    await done

    arrive('goto', { from: '/ascents/68', to: '/routes/108/ascents' })

    // Recorded as a push, the trail gains an entry the browser does not have, `canGoBack()` turns
    // true, and back calls `history.back()` on a stack with nothing behind it.
    expect(onNavigation.mock.lastCall?.[0], 'the browser replaced, so the trail must say replace').toBe('replace')
  })

  // Only a `goto` can be the arrival a replace was waiting for. An enter or popstate landing on the
  // same pathname must not spend the record, or the replace that follows is counted as a push. Found
  // in review; it is the original bug's shape, moved from a boolean to a pathname match.
  it('does not let an enter or popstate consume a pending replace', async () => {
    const { arrive, navigation, onNavigation } = await load()

    void navigation.replaceUrl('/routes/108/ascents?ascent=68')
    // A resolver forwarding within its own pathname makes this the ordinary case, not a freak one.
    arrive('enter', { from: null, to: '/routes/108/ascents' })
    arrive('popstate', { from: '/feed', to: '/routes/108/ascents' })

    arrive('goto', { from: '/feed', to: '/routes/108/ascents' })

    expect(onNavigation.mock.lastCall?.[0], 'the replace still owns its arrival').toBe('replace')
  })
})
