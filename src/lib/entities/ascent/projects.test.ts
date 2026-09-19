import { describe, expect, it } from 'vitest'
import type { AscentType, UserAscentDetail } from './dto'
import { deriveProjects } from './projects'

// deriveProjects only reads routeFk/type/dateTime; the rest of UserAscentDetail is irrelevant here.
const ascent = (routeFk: number, type: AscentType, dateTime: number): UserAscentDetail =>
  ({ dateTime, routeFk, type }) as UserAscentDetail

describe('deriveProjects', () => {
  it('classifies open, completed, and non-projects, sorted by most recent session', () => {
    const { completed, open } = deriveProjects([
      // Open: only attempts.
      ascent(1, 'attempt', 100),
      ascent(1, 'attempt', 300),
      // Completed: >1 attempt plus a non-attempt.
      ascent(2, 'attempt', 100),
      ascent(2, 'attempt', 150),
      ascent(2, 'redpoint', 200),
      // Not a project: sent with a single attempt.
      ascent(3, 'attempt', 100),
      ascent(3, 'flash', 100),
      // Open: a single attempt, never sent.
      ascent(4, 'attempt', 100),
      // Open, worked more recently than the others.
      ascent(5, 'attempt', 400),
      ascent(5, 'attempt', 500),
    ])

    expect(open.map((project) => project.routeFk)).toEqual([5, 1, 4]) // recency desc
    expect(open.find((project) => project.routeFk === 1)).toMatchObject({ lastSession: 300, routeFk: 1, sessions: 2 })
    expect(completed.map((project) => project.routeFk)).toEqual([2])
    expect(completed[0]).toMatchObject({ lastSession: 200, routeFk: 2, sessions: 3 })
  })

  it('is neither open nor completed when sent with a single attempt', () => {
    const { completed, open } = deriveProjects([ascent(1, 'attempt', 100), ascent(1, 'redpoint', 200)])

    expect(open).toEqual([])
    expect(completed).toEqual([])
  })

  it('counts only the run up to the first send, ignoring later repeat cycles', () => {
    const { completed, open } = deriveProjects([
      ascent(1, 'attempt', 100),
      ascent(1, 'attempt', 200),
      ascent(1, 'redpoint', 300),
      // Two years later: a failed session, then a repeat. Ignored for this project.
      ascent(1, 'attempt', 1000),
      ascent(1, 'repeat', 1100),
    ])

    expect(open).toEqual([])
    // sessions = attempt + attempt + redpoint = 3; dated by the first send (300), not the repeat.
    expect(completed).toEqual([{ lastSession: 300, routeFk: 1, sessions: 3 }])
  })

  it('orders ascents chronologically before classifying', () => {
    // Input out of order: the redpoint is listed first but dated last.
    const { completed } = deriveProjects([
      ascent(1, 'redpoint', 300),
      ascent(1, 'attempt', 100),
      ascent(1, 'attempt', 200),
    ])

    expect(completed).toEqual([{ lastSession: 300, routeFk: 1, sessions: 3 }])
  })

  it('folds rows that share a route and a day into one session', () => {
    const { open } = deriveProjects([
      // A second row on a day already logged is a mistake, not a second visit.
      ascent(1, 'attempt', 100),
      ascent(1, 'attempt', 100),
      ascent(1, 'attempt', 300),
    ])

    expect(open[0]).toMatchObject({ routeFk: 1, sessions: 2 })
  })

  it('is not a project when the whole run happened in one day', () => {
    // The case that used to read "3 sessions in a single day" on a feed banner.
    const { completed, open } = deriveProjects([
      ascent(1, 'attempt', 100),
      ascent(1, 'attempt', 100),
      ascent(1, 'redpoint', 100),
    ])

    expect(open).toEqual([])
    expect(completed).toEqual([])
  })

  it('counts the send day once when an attempt shares it', () => {
    const { completed } = deriveProjects([
      ascent(1, 'attempt', 100),
      ascent(1, 'attempt', 200),
      ascent(1, 'attempt', 300),
      // Same day as the send: one session, not two.
      ascent(1, 'redpoint', 300),
    ])

    expect(completed).toEqual([{ lastSession: 300, routeFk: 1, sessions: 3 }])
  })
})
