import { describe, expect, it } from 'vitest'
import type { Grade } from './dto'
import { gradeLabel, rungSpans, scaleRungs } from './label'

/** The seeded ladder across the stretch where Font is finer than V. */
const grades: Grade[] = [
  { FB: 'FB 5+', id: 4, V: 'V2' },
  { FB: 'FB 6A', id: 5, V: 'V3' },
  { FB: 'FB 6A+', id: 6, V: 'V3' },
  { FB: 'FB 6B', id: 7, V: 'V4' },
  { FB: 'FB 6B+', id: 8, V: 'V4' },
  { FB: 'FB 6C', id: 9, V: 'V5' },
]

describe('gradeLabel', () => {
  it('strips the redundant scale prefix', () => {
    expect(gradeLabel(grades, 'FB', 5)).toBe('6A')
    expect(gradeLabel(grades, 'V', 5)).toBe('V3')
  })

  it('gives the empty glyph for an ungraded route', () => {
    expect(gradeLabel(grades, 'FB', undefined)).toBe('—')
    expect(gradeLabel(grades, 'FB', 999)).toBe('—')
  })
})

describe('scaleRungs', () => {
  it('offers every Font grade, since Font never repeats', () => {
    expect(scaleRungs(grades, 'FB').map((rung) => rung.label)).toEqual(['5+', '6A', '6A+', '6B', '6B+', '6C'])
  })

  it('collapses the V labels that cover two Font grades', () => {
    expect(scaleRungs(grades, 'V').map((rung) => rung.label)).toEqual(['V2', 'V3', 'V4', 'V5'])
  })

  it('stores the grade the conversion charts name, not the one with no V equivalent', () => {
    // V3 is 6A. 6A+ is the Font grade V has no word for.
    expect(scaleRungs(grades, 'V').find((rung) => rung.label === 'V3')?.id).toBe(5)
    expect(scaleRungs(grades, 'V').find((rung) => rung.label === 'V4')?.id).toBe(7)
  })

  // A V climber opening a 6A+ route: the V3 rung must adopt it, or saving downgrades it to 6A.
  it('keeps a grade the collapse would otherwise drop', () => {
    const rungs = scaleRungs(grades, 'V', 6)
    expect(rungs.find((rung) => rung.label === 'V3')?.id).toBe(6)
    expect(rungs.map((rung) => rung.label)).toEqual(['V2', 'V3', 'V4', 'V5'])
  })

  it('adopts only the rung the grade belongs to', () => {
    const rungs = scaleRungs(grades, 'V', 8)
    expect(rungs.find((rung) => rung.label === 'V4')?.id).toBe(8)
    expect(rungs.find((rung) => rung.label === 'V3')?.id).toBe(5)
  })

  it('steps a V climber past the whole pair, never onto its twin', () => {
    const rungs = scaleRungs(grades, 'V', 6)
    const at = rungs.findIndex((rung) => rung.id === 6)
    expect(rungs[at + 1].label).toBe('V4')
    expect(rungs[at - 1].label).toBe('V2')
  })
})

describe('rungSpans', () => {
  it('gives every Font grade a span of one', () => {
    const spans = rungSpans(grades, scaleRungs(grades, 'FB'))
    expect(spans).toEqual(grades.map((_, index) => ({ first: index, last: index })))
  })

  // Using `first` for both bounds is what makes "up to V3" exclude the 6A+ routes V3 also covers.
  it('ends a doubled rung on its second grade, not its first', () => {
    const rungs = scaleRungs(grades, 'V')
    const spans = rungSpans(grades, rungs)
    const v3 = spans[rungs.findIndex((rung) => rung.label === 'V3')]

    expect(grades[v3.first].FB).toBe('FB 6A')
    expect(grades[v3.last].FB).toBe('FB 6A+')
  })

  it('covers the grades array exactly once, with no gap and no overlap', () => {
    for (const scale of ['FB', 'V'] as const) {
      const spans = rungSpans(grades, scaleRungs(grades, scale))
      const covered = spans.flatMap((span) => grades.slice(span.first, span.last + 1))

      expect(covered, scale).toEqual(grades)
      expect(spans.at(0)?.first, scale).toBe(0)
      expect(spans.at(-1)?.last, scale).toBe(grades.length - 1)
    }
  })

  it('keeps the whole range selectable on both scales', () => {
    for (const scale of ['FB', 'V'] as const) {
      const spans = rungSpans(grades, scaleRungs(grades, scale))
      // What Filter.svelte's "whole range means no query params" shortcut relies on.
      expect([spans[0].first, spans.at(-1)?.last], scale).toEqual([0, grades.length - 1])
    }
  })
})
