import { describe, expect, it } from 'vitest'
import { deriveAccolade, parseAccolade, type AccoladeAscent } from './accolade'

const DAY = 24 * 60 * 60 * 1000
const day = (n: number) => Date.UTC(2026, 0, n)

let next = 1
const ascent = (partial: Partial<AccoladeAscent> = {}): AccoladeAscent => ({
  dateTime: day(1),
  gradeFk: 10,
  id: next++,
  routeFk: 1,
  type: 'redpoint',
  ...partial,
})

describe('deriveAccolade', () => {
  it('claims nothing for an attempt that would otherwise top the window', () => {
    // The history is the test. A lone attempt earns nothing whether or not the guard is there, so
    // asserting on one says nothing about it: this one would claim the ceiling without it.
    const easier = ascent({ dateTime: day(20), gradeFk: 8, routeFk: 2 })
    const failed = ascent({ dateTime: day(100), gradeFk: 30, routeFk: 4, type: 'attempt' })

    expect(deriveAccolade(failed, { onRoute: [easier, failed], window: [easier, failed] })).toBeUndefined()
  })

  it('claims the project when the send ended a run of attempts', () => {
    const tries = [day(1), day(8), day(30), day(61)].map((at) => ascent({ dateTime: at, type: 'attempt' }))
    const send = ascent({ dateTime: day(90) })

    expect(deriveAccolade(send, { onRoute: [...tries, send], window: [...tries, send] })).toEqual({
      days: 89,
      kind: 'project',
      sessions: 5,
    })
  })

  it('does not call one attempt a project', () => {
    // `deriveProjects` owns this rule: a route sent with at most one prior attempt was never a
    // project. Asserted here because it is the boundary the banner hangs off.
    const first = ascent({ type: 'attempt' })
    const send = ascent({ dateTime: day(2), gradeFk: 1 })

    expect(deriveAccolade(send, { onRoute: [first, send], window: [first, send] })).toBeUndefined()
  })

  it('does not re-award a project when the climber comes back to it', () => {
    const tries = [day(1), day(8), day(30)].map((at) => ascent({ dateTime: at, type: 'attempt' }))
    const send = ascent({ dateTime: day(40) })
    const repeat = ascent({ dateTime: day(300), type: 'repeat' })

    expect(
      deriveAccolade(repeat, { onRoute: [...tries, send, repeat], window: [...tries, send, repeat] }),
    ).toBeUndefined()
  })

  it('claims the ceiling when the send is the hardest of its type in the window', () => {
    const history = [
      ascent({ dateTime: day(10), gradeFk: 8, routeFk: 2 }),
      ascent({ dateTime: day(40), gradeFk: 9, routeFk: 3 }),
    ]
    const send = ascent({ dateTime: day(100), gradeFk: 11, routeFk: 4 })

    expect(deriveAccolade(send, { onRoute: [...history, send], window: [...history, send] })).toEqual({
      kind: 'ceiling',
    })
  })

  it('lets a redpoint below an old flash still be the hardest redpoint', () => {
    // The case grade alone gets wrong. A flash sits at a different ceiling from a redpoint, and
    // comparing across the two would silence the harder achievement.
    const flash = ascent({ dateTime: day(10), gradeFk: 20, routeFk: 2, type: 'flash' })
    const earlier = ascent({ dateTime: day(20), gradeFk: 9, routeFk: 3 })
    const send = ascent({ dateTime: day(100), gradeFk: 12, routeFk: 4 })

    expect(deriveAccolade(send, { onRoute: [flash, earlier, send], window: [flash, earlier, send] })).toEqual({
      kind: 'ceiling',
    })
  })

  it('ignores a harder send from outside the window', () => {
    // Eight years ago, harder than anything since. A lifetime maximum would veto every banner for
    // this climber; twelve months does not.
    const longAgo = ascent({ dateTime: day(100) - 8 * 365 * DAY, gradeFk: 21, routeFk: 2 })
    const withinWindow = ascent({ dateTime: day(40), gradeFk: 9, routeFk: 3 })
    const send = ascent({ dateTime: day(100), gradeFk: 14, routeFk: 4 })

    expect(
      deriveAccolade(send, { onRoute: [longAgo, withinWindow, send], window: [longAgo, withinWindow, send] }),
    ).toEqual({ kind: 'ceiling' })
  })

  it('claims nothing for a first ever send of its type', () => {
    const send = ascent({ dateTime: day(100), gradeFk: 14 })

    expect(deriveAccolade(send, { onRoute: [send], window: [send] })).toBeUndefined()
  })

  it('claims nothing when an equal grade is already in the window', () => {
    const equal = ascent({ dateTime: day(40), gradeFk: 14, routeFk: 2 })
    const send = ascent({ dateTime: day(100), gradeFk: 14, routeFk: 4 })

    expect(deriveAccolade(send, { onRoute: [equal, send], window: [equal, send] })).toBeUndefined()
  })

  it('ranks effort above grade', () => {
    // Both claims are true of this send. The card gets one, and it is the project.
    const tries = [day(1), day(8), day(30)].map((at) => ascent({ dateTime: at, type: 'attempt' }))
    const easier = ascent({ dateTime: day(20), gradeFk: 3, routeFk: 2 })
    const send = ascent({ dateTime: day(40), gradeFk: 18 })

    expect(deriveAccolade(send, { onRoute: [...tries, easier, send], window: [...tries, easier, send] })).toEqual({
      days: 39,
      kind: 'project',
      sessions: 4,
    })
  })

  it('ignores an ungraded earlier ascent rather than letting it veto the ceiling', () => {
    // Half the ascents in this app are logged without a grade. Treating "no opinion" as "not
    // lower" let one ungraded redpoint in March silently kill the banner for the hardest send of
    // the year in July.
    const ungraded = ascent({ dateTime: day(20), gradeFk: undefined, routeFk: 2 })
    const easier = ascent({ dateTime: day(40), gradeFk: 9, routeFk: 3 })
    const send = ascent({ dateTime: day(100), gradeFk: 14, routeFk: 4 })

    expect(deriveAccolade(send, { onRoute: [ungraded, easier, send], window: [ungraded, easier, send] })).toEqual({
      kind: 'ceiling',
    })
  })

  it('claims nothing when every earlier ascent of that type is ungraded', () => {
    // The floor counts graded evidence, not rows: a history of nothing but ungraded ascents is not
    // something to be hardest of.
    const ungraded = ascent({ dateTime: day(40), gradeFk: undefined, routeFk: 2 })
    const send = ascent({ dateTime: day(100), gradeFk: 14, routeFk: 4 })

    expect(deriveAccolade(send, { onRoute: [ungraded, send], window: [ungraded, send] })).toBeUndefined()
  })

  it('still claims the project when a victory lap lands the same day', () => {
    // `date_time` is a pg `date`, so the send and a same-day repeat carry the SAME value. Comparing
    // with `<=` made each "already sent before today" from the other's side and killed the claim on
    // both, erasing a banner the send had already earned.
    const tries = [day(1), day(8), day(30)].map((at) => ascent({ dateTime: at, type: 'attempt' }))
    const send = ascent({ dateTime: day(40) })
    const lap = ascent({ dateTime: day(40), type: 'repeat' })

    expect(deriveAccolade(send, { onRoute: [...tries, send, lap], window: [...tries, send, lap] })).toEqual({
      days: 39,
      kind: 'project',
      sessions: 4,
    })
    // And the lap itself still earns nothing: the send before it ended the project.
    expect(deriveAccolade(lap, { onRoute: [...tries, send, lap], window: [...tries, send, lap] })).toBeUndefined()
  })

  it('claims no project when the whole run happened on one day', () => {
    // One row per route per day is what a climber logs, so three rows on one date are a mistake
    // rather than three visits. They fold, the run is one session, and nothing was projected.
    // This used to produce a banner reading "3 sessions in a single day".
    const tries = [ascent({ type: 'attempt' }), ascent({ type: 'attempt' })]
    const send = ascent()

    expect(deriveAccolade(send, { onRoute: [...tries, send], window: [...tries, send] })).toBeUndefined()
  })

  it('counts days rather than rows, so a duplicated day does not inflate the claim', () => {
    const tries = [day(1), day(1), day(8)].map((at) => ascent({ dateTime: at, type: 'attempt' }))
    const send = ascent({ dateTime: day(30) })

    expect(deriveAccolade(send, { onRoute: [...tries, send], window: [...tries, send] })).toEqual({
      days: 29,
      kind: 'project',
      sessions: 3,
    })
  })

  it('measures a repeat against redpoints, not only against other repeats', () => {
    // The bug: a climber who repeats one thing a year was trivially their own hardest repeater,
    // so a climb that broke no new ground wore the banner.
    const redpoint = ascent({ dateTime: day(1), gradeFk: 20, routeFk: 2 })
    const softRepeat = ascent({ dateTime: day(30), gradeFk: 15, routeFk: 3, type: 'repeat' })

    expect(deriveAccolade(softRepeat, { window: [redpoint, softRepeat] })).toBeUndefined()

    // Beating every worked send of the year still says something, so it still claims.
    const hardRepeat = ascent({ dateTime: day(30), gradeFk: 25, routeFk: 3, type: 'repeat' })

    expect(deriveAccolade(hardRepeat, { window: [redpoint, hardRepeat] })).toEqual({ kind: 'ceiling' })
  })

  it('lets a hard repeat block a weaker redpoint, which it could not do before', () => {
    const repeat = ascent({ dateTime: day(1), gradeFk: 25, routeFk: 2, type: 'repeat' })
    const redpoint = ascent({ dateTime: day(30), gradeFk: 20, routeFk: 3 })

    expect(deriveAccolade(redpoint, { window: [repeat, redpoint] })).toBeUndefined()
  })

  it('keeps the flash pool separate from the worked one', () => {
    // A flash is a different achievement, so a harder redpoint neither blocks it nor feeds it.
    const redpoint = ascent({ dateTime: day(1), gradeFk: 30, routeFk: 2 })
    const flash = ascent({ dateTime: day(30), gradeFk: 20, routeFk: 3, type: 'flash' })

    // Vacuous: no earlier FLASH to beat, so there is no ceiling to claim either way.
    expect(deriveAccolade(flash, { window: [redpoint, flash] })).toBeUndefined()

    const softFlash = ascent({ dateTime: day(2), gradeFk: 10, routeFk: 4, type: 'flash' })

    expect(deriveAccolade(flash, { window: [redpoint, softFlash, flash] })).toEqual({ kind: 'ceiling' })
  })

  it('never counts an attempt as evidence about a ceiling', () => {
    // Attempts share a pool with the redpoint they were attempts at, so they are dropped by hand.
    // Ungraded or not, a failure says nothing about how hard somebody climbs.
    const failed = ascent({ dateTime: day(1), gradeFk: 30, routeFk: 2, type: 'attempt' })
    const redpoint = ascent({ dateTime: day(2), gradeFk: 20, routeFk: 3 })
    const earlier = ascent({ dateTime: day(1), gradeFk: 10, routeFk: 4 })

    expect(deriveAccolade(redpoint, { window: [failed, earlier, redpoint] })).toEqual({ kind: 'ceiling' })
  })

  it('never invents a project from a windowed history', () => {
    // What declaring coverage exists for. A repeat whose first send predates the loaded window sees
    // only the attempts inside it, and the full derivation would report those as a project run.
    const truncated = [ascent({ dateTime: day(20), type: 'attempt' }), ascent({ dateTime: day(30), type: 'attempt' })]
    const repeat = ascent({ dateTime: day(60), type: 'repeat' })

    expect(deriveAccolade(repeat, { onRoute: [...truncated, repeat], window: [...truncated, repeat] })).toEqual({
      days: 40,
      kind: 'project',
      sessions: 3,
    })
    expect(deriveAccolade(repeat, { window: [...truncated, repeat] })).toBeUndefined()
  })

  it('claims nothing when the window holds one easier send and one harder', () => {
    // The floor is every graded send in the pool, not any of them. A mixed year is the ordinary
    // case, and reading it as "beat something" would put the banner on a middling climb.
    const easier = ascent({ dateTime: day(20), gradeFk: 8, routeFk: 2 })
    const harder = ascent({ dateTime: day(40), gradeFk: 20, routeFk: 3 })
    const send = ascent({ dateTime: day(100), gradeFk: 14, routeFk: 4 })

    expect(deriveAccolade(send, { window: [easier, harder, send] })).toBeUndefined()
  })

  it('counts a send from the same day as evidence, which a pg date cannot order', () => {
    // `date_time` is a pg `date`, so an earlier send on the afternoon of the same day carries the
    // SAME value. Excluding it would throw away the only evidence this climb beat anything.
    const sameDay = ascent({ dateTime: day(100), gradeFk: 8, routeFk: 2 })
    const send = ascent({ dateTime: day(100), gradeFk: 14, routeFk: 4 })

    expect(deriveAccolade(send, { window: [sameDay, send] })).toEqual({ kind: 'ceiling' })
  })

  it('counts a send landing exactly on the window edge', () => {
    const onEdge = ascent({ dateTime: day(100) - 365 * DAY, gradeFk: 8, routeFk: 2 })
    const send = ascent({ dateTime: day(100), gradeFk: 14, routeFk: 4 })

    expect(deriveAccolade(send, { window: [onEdge, send] })).toEqual({ kind: 'ceiling' })
  })

  it('ignores an undated attempt when measuring how long the project ran', () => {
    // An undated row carries no start. Folding it in as one reads the epoch as the first session
    // and reports a project fifty-six years long.
    const undated = ascent({ dateTime: undefined, type: 'attempt' })
    const tries = [day(1), day(8), day(30)].map((at) => ascent({ dateTime: at, type: 'attempt' }))
    const send = ascent({ dateTime: day(40) })
    const history = [undated, ...tries, send]

    // `sessions` counts it, because `deriveProjects` groups undated rows as their own visit. Only
    // the span is guarded here.
    expect(deriveAccolade(send, { onRoute: history, window: history })).toEqual({
      days: 39,
      kind: 'project',
      sessions: 5,
    })
  })

  it('claims nothing on an ungraded send with no project behind it', () => {
    const earlier = ascent({ dateTime: day(40), gradeFk: 9, routeFk: 2 })
    const send = ascent({ dateTime: day(100), gradeFk: undefined, routeFk: 4 })

    expect(deriveAccolade(send, { onRoute: [earlier, send], window: [earlier, send] })).toBeUndefined()
  })
})

/**
 * The read side of the column, which must never throw: it is written by one function and read by
 * one card, but it is still text in a database that an older release or a hand edit can have
 * written. Anything it cannot vouch for reads as "no claim" rather than taking the feed down.
 */
describe('parseAccolade', () => {
  it('round-trips the two claims it writes', () => {
    expect(parseAccolade(JSON.stringify({ kind: 'ceiling' }))).toEqual({ kind: 'ceiling' })
    expect(parseAccolade(JSON.stringify({ days: 89, kind: 'project', sessions: 5 }))).toEqual({
      days: 89,
      kind: 'project',
      sessions: 5,
    })
  })

  it.each([
    ['nothing stored', null],
    ['an undefined column', undefined],
    ['an empty string', ''],
  ])('reads %s as no claim', (_label, stored) => {
    expect(parseAccolade(stored)).toBeUndefined()
  })

  it.each([
    ['a half-written value', '{"kind":"proj'],
    ['text that is not JSON at all', 'ceiling'],
  ])('reads %s as no claim rather than throwing', (_label, stored) => {
    expect(() => parseAccolade(stored)).not.toThrow()
    expect(parseAccolade(stored)).toBeUndefined()
  })

  it.each([
    ['a JSON number', '3'],
    ['a JSON null', 'null'],
    ['a JSON string', '"ceiling"'],
  ])('reads %s as no claim, having parsed but not to an object', (_label, stored) => {
    expect(parseAccolade(stored)).toBeUndefined()
  })

  it('reads a kind it does not know as no claim', () => {
    // An older shape, or one a later release writes and this one has not learned.
    expect(parseAccolade(JSON.stringify({ kind: 'onsight' }))).toBeUndefined()
  })

  it.each([
    ['no days', { kind: 'project', sessions: 5 }],
    ['no sessions', { days: 89, kind: 'project' }],
    ['days as a string', { days: '89', kind: 'project', sessions: 5 }],
  ])('reads a project claim with %s as no claim', (_label, stored) => {
    // Not a partial claim: the card renders `days` and `sessions`, so half of one is not a claim.
    expect(parseAccolade(JSON.stringify(stored))).toBeUndefined()
  })
})
