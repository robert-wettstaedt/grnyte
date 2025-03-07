import { getDistance } from '$lib/geometry'
import type { PointDTO } from '$lib/topo'
import type { Coordinates, Line } from './Route.svelte'

export const calcLines = (points: PointDTO[]): Line[] => {
  // If there are no points at all, return empty array
  if (points.length === 0) {
    return []
  }

  const startPoints = points.filter((point) => point.type === 'start')
  const startPoint = calcMiddlePoint(startPoints)
  const lines: Array<Line> = []

  if (startPoints.length === 2) {
    const [from, to] = startPoints
    lines.push({ from, to })
  }

  // Get all non-start points
  const nonStartPoints = points.filter((point) => point.type !== 'start')

  // Separate end points (type = top) from other points
  const endPoint = nonStartPoints.find((point) => point.type === 'top')
  const middlePoints = nonStartPoints.filter((point) => point.type !== 'top')

  // Create path using nearest neighbor algorithm for middle points
  const path: PointDTO[] = []
  const unvisitedPoints = [...middlePoints]

  // Determine initial point for path construction
  let currentPoint: Coordinates

  if (startPoint != null) {
    // If we have a start point, use it
    currentPoint = startPoint
  } else if (middlePoints.length > 0) {
    // No start point, but we have middle points - use the first middle point
    currentPoint = middlePoints[0]
    // Remove this point from unvisited points and add it to the path
    path.push(middlePoints[0])
    unvisitedPoints.shift()
  } else if (endPoint != null) {
    // No start or middle points, but we have end points - use the first end point
    // Note: we won't add this to the path yet as end points come last
    currentPoint = endPoint
  } else {
    // This case shouldn't happen as we checked points.length above
    return []
  }

  // While there are still unvisited points
  while (unvisitedPoints.length > 0) {
    // Find the nearest unvisited point to the current point
    let nearestPointIndex = 0
    let minDistance = Infinity

    unvisitedPoints.forEach((point, index) => {
      const distance = getDistance(currentPoint, point)
      if (distance < minDistance) {
        minDistance = distance
        nearestPointIndex = index
      }
    })

    // Add nearest point to path
    const nearestPoint = unvisitedPoints[nearestPointIndex]
    path.push(nearestPoint)

    // Update current point
    currentPoint = nearestPoint

    // Remove the visited point from unvisited points
    unvisitedPoints.splice(nearestPointIndex, 1)
  }

  // Create lines connecting points in path order
  let finalPath: Coordinates[] = []

  // If we have a start point, include it at the beginning
  if (startPoint == null) {
    finalPath = [...path]

    if (endPoint != null) {
      finalPath.reverse().push(endPoint)
    }
  } else {
    finalPath = [startPoint, ...path]

    if (endPoint != null) {
      finalPath.push(endPoint)
    }
  }

  // Create lines from the path
  const linesToAdd = finalPath.flatMap((from, index, arr): Line[] => {
    const to = arr.at(index + 1)

    if (to == null) {
      return []
    }

    return [{ from, to }]
  })

  return [...lines, ...linesToAdd]
}

export const calcMiddlePoint = (points: PointDTO[]): Coordinates | undefined => {
  const coordinate = points.reduce(
    (coordinate, point, _, arr) => ({
      x: (coordinate?.x ?? 0) + point.x / arr.length,
      y: (coordinate?.y ?? 0) + point.y / arr.length,
    }),
    undefined as Coordinates | undefined,
  )

  return coordinate
}
