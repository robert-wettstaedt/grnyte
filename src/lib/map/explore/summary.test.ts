import { describe, expect, it } from 'vitest'
import { answersFromSummary, countsFromSummary, inGradeRange, withoutRoutes } from './summary'

const none = { ascentStatus: undefined, favoritesOnly: false, filter: {} }

describe('answersFromSummary', () => {
  it('is true with no filter or only a grade range', () => {
    expect(answersFromSummary(none)).toBe(true)
    expect(answersFromSummary({ ...none, filter: { maxGrade: 20, minGrade: 12 } })).toBe(true)
  })

  it('is true for "not sent yet", alone or with a grade range', () => {
    expect(answersFromSummary({ ...none, ascentStatus: 'todo' })).toBe(true)
    expect(answersFromSummary({ ...none, ascentStatus: 'todo', filter: { minGrade: 12 } })).toBe(true)
  })

  it('is false for anything a summary cannot know', () => {
    expect(answersFromSummary({ ...none, filter: { minGrade: 12, tags: ['dyn'] } })).toBe(false)
    expect(answersFromSummary({ ...none, filter: { hasTopo: true } })).toBe(false)
    expect(answersFromSummary({ ...none, ascentStatus: 'done' })).toBe(false)
    expect(answersFromSummary({ ...none, favoritesOnly: true })).toBe(false)
  })
})

const blocks = [
  {
    gradeCounts: new Map([
      [12, 2],
      [15, 1],
    ]),
    id: 1,
    routeCount: 4,
  },
  { gradeCounts: new Map([[20, 1]]), id: 2, routeCount: 1 },
  { gradeCounts: new Map(), id: 3, routeCount: 0 },
]

describe('countsFromSummary', () => {
  it('counts every live route without a filter, ungraded too, and skips empty blocks', () => {
    const { gradeCountByBlock, routeCountByBlock } = countsFromSummary(blocks, {})
    expect([...routeCountByBlock]).toEqual([
      [1, 4],
      [2, 1],
    ])
    expect(gradeCountByBlock.get(1)).toEqual(
      new Map([
        [12, 2],
        [15, 1],
      ]),
    )
  })

  it('keeps only the routes inside a grade range', () => {
    const { gradeCountByBlock, routeCountByBlock } = countsFromSummary(blocks, { maxGrade: 15, minGrade: 13 })
    expect([...routeCountByBlock]).toEqual([[1, 1]])
    expect(gradeCountByBlock.get(1)).toEqual(new Map([[15, 1]]))
  })
})

describe('withoutRoutes', () => {
  const counts = countsFromSummary(blocks, {})

  it("takes the reader's sent routes out of their blocks, ungraded ones too, and drops emptied blocks", () => {
    const { gradeCountByBlock, routeCountByBlock } = withoutRoutes(
      counts,
      [
        { blockFk: 1, gradeFk: 12 },
        { blockFk: 1, gradeFk: undefined },
        { blockFk: 2, gradeFk: 20 },
      ],
      {},
    )
    expect([...routeCountByBlock]).toEqual([[1, 2]])
    expect(gradeCountByBlock.get(1)).toEqual(
      new Map([
        [12, 1],
        [15, 1],
      ]),
    )
  })

  it('leaves a sent route outside the grade range alone, as the range already left it out', () => {
    const ranged = countsFromSummary(
      [
        {
          gradeCounts: new Map([
            [12, 2],
            [15, 1],
          ]),
          id: 1,
          routeCount: 3,
        },
      ],
      { minGrade: 13 },
    )
    const { routeCountByBlock } = withoutRoutes(ranged, [{ blockFk: 1, gradeFk: 12 }], { minGrade: 13 })
    expect(routeCountByBlock.get(1)).toBe(1)
  })
})

describe('inGradeRange', () => {
  it('keeps every route without a range, and only graded ones inside it with one', () => {
    expect([inGradeRange({}, undefined), inGradeRange({}, 30)]).toEqual([true, true])
    expect([12, 13, 15, 16, undefined].map((g) => inGradeRange({ maxGrade: 15, minGrade: 13 }, g))).toEqual([
      false,
      true,
      true,
      false,
      false,
    ])
  })
})
