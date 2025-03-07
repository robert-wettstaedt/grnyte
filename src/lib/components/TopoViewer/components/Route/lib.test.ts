import type { PointDTO } from '$lib/topo'
import { describe, expect, it } from 'vitest'
import { calcLines } from './lib'

describe('calcLines', () => {
  it('should return empty array for empty points', () => {
    const result = calcLines([])
    expect(result).toEqual([])
  })

  it('should handle routes with only start points', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'start', id: '1' },
      { x: 20, y: 20, type: 'start', id: '2' },
    ]

    const result = calcLines(points)

    expect(result.length).toBe(1)
    expect(result[0].from).toEqual(points[0])
    expect(result[0].to).toEqual(points[1])
  })

  it('should handle routes with start, middle and end points', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'start', id: '1' },
      { x: 20, y: 20, type: 'middle', id: '2' },
      { x: 30, y: 30, type: 'top', id: '3' },
    ]

    const result = calcLines(points)

    // Should have 2 lines: start-to-middle and middle-to-end
    expect(result.length).toBe(2)

    // Check that end point is the destination of the last line
    const lastLine = result[result.length - 1]
    expect(lastLine.to).toEqual(points[2])
  })

  it('should handle routes with only middle points (no start/end)', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'middle', id: '1' },
      { x: 20, y: 20, type: 'middle', id: '2' },
      { x: 30, y: 30, type: 'middle', id: '3' },
    ]

    const result = calcLines(points)

    // Should create a path connecting all points
    expect(result.length).toBe(2)

    // First line should start from first point
    expect(result[0].from).toEqual(points[0])
  })

  it('should handle routes with only end points', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'top', id: '1' },
      { x: 20, y: 20, type: 'top', id: '2' },
    ]

    const result = calcLines(points)

    // Should create a path connecting the end points
    expect(result.length).toBe(1)
  })

  it('should handle routes with middle and end points (no start)', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'middle', id: '1' },
      { x: 20, y: 20, type: 'middle', id: '2' },
      { x: 30, y: 30, type: 'top', id: '3' },
    ]

    const result = calcLines(points)

    // Should have appropriate number of lines connecting points
    expect(result.length).toBe(2)

    // Check that end point is the destination of the last line
    const lastLine = result[result.length - 1]
    expect(lastLine.to).toEqual(points[2])
  })

  it('should handle routes with start and end points (no middle)', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'start', id: '1' },
      { x: 30, y: 30, type: 'top', id: '2' },
    ]

    const result = calcLines(points)

    // Should connect start directly to end
    expect(result.length).toBe(1)

    // Check that the line goes from start to end
    expect(result[0].from.x).toBe(10)
    expect(result[0].from.y).toBe(10)
    expect(result[0].to.x).toBe(30)
    expect(result[0].to.y).toBe(30)
  })

  it('should ensure end points always come last', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'middle', id: '1' },
      { x: 50, y: 50, type: 'top', id: '2' }, // End point that's far away
      { x: 20, y: 20, type: 'middle', id: '3' }, // Closer middle point
      { x: 30, y: 30, type: 'middle', id: '4' },
    ]

    const result = calcLines(points)

    // Last line should end at the end point, even though it's not the closest neighbor
    const lastLine = result[result.length - 1]
    expect(lastLine.to).toEqual(points[1])
  })

  it('should handle multiple end points', () => {
    const points: PointDTO[] = [
      { x: 10, y: 10, type: 'middle', id: '1' },
      { x: 20, y: 20, type: 'top', id: '2' },
      { x: 30, y: 30, type: 'top', id: '3' },
    ]

    const result = calcLines(points)

    // Should have appropriate number of lines
    expect(result.length).toBe(2)

    // All end points should be part of the path
    // and they should be at the end of the path
    const secondToLast = result[result.length - 2]
    const last = result[result.length - 1]

    // Check if coordinates match the end points
    const topPoints = points.filter((p) => p.type === 'top')

    // The last two lines' destinations should match the coordinates of the top points
    expect(topPoints.some((p) => p.x === secondToLast.to.x && p.y === secondToLast.to.y)).toBe(true)
    expect(topPoints.some((p) => p.x === last.to.x && p.y === last.to.y)).toBe(true)
  })
})
