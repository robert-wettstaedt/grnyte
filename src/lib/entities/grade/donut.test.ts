import { describe, expect, it } from 'vitest'
import { buildGradeDonutSvg } from './donut'

describe('buildGradeDonutSvg', () => {
  it('prints a known total, zero included', () => {
    expect(buildGradeDonutSvg(new Map(), 0, 32)).toContain('>0</text>')
  })

  it('draws a withheld total as an empty ring, with no number', () => {
    const svg = buildGradeDonutSvg(new Map([[1, 3]]), undefined, 32)
    expect(svg).not.toContain('<text')
    expect(svg).not.toContain('stroke-dasharray')
  })
})
