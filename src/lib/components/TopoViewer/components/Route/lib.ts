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
  const endPoints = nonStartPoints.filter((point) => point.type === 'top')
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
  } else if (endPoints.length > 0) {
    // No start or middle points, but we have end points - use the first end point
    // Note: we won't add this to the path yet as end points come last
    currentPoint = endPoints[0]
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

  // If there are end points, add them to the path
  if (endPoints.length > 0) {
    // If there are multiple end points, sort them by distance from the last point in path
    // or use the nearest neighbor approach again
    if (endPoints.length > 1) {
      const lastPathPoint = path.length > 0 ? path[path.length - 1] : currentPoint

      // Use nearest neighbor approach for multiple end points
      const endPath: PointDTO[] = []
      const unvisitedEndPoints = [...endPoints]
      let currentEndPoint: Coordinates = lastPathPoint

      while (unvisitedEndPoints.length > 0) {
        let nearestEndPointIndex = 0
        let minEndDistance = Infinity

        unvisitedEndPoints.forEach((point, index) => {
          const distance = getDistance(currentEndPoint, point)
          if (distance < minEndDistance) {
            minEndDistance = distance
            nearestEndPointIndex = index
          }
        })

        const nearestEndPoint = unvisitedEndPoints[nearestEndPointIndex]
        endPath.push(nearestEndPoint)
        currentEndPoint = nearestEndPoint
        unvisitedEndPoints.splice(nearestEndPointIndex, 1)
      }

      path.push(...endPath)
    } else {
      // Only one end point, just add it
      path.push(endPoints[0])
    }
  }

  // Create lines connecting points in path order
  let finalPath: Coordinates[] = []

  // If we have a start point, include it at the beginning
  if (startPoint != null) {
    finalPath = [startPoint, ...path]
  } else {
    finalPath = [...path]
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
