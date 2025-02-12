import type { InferResultType } from '$lib/db/types'
import type { ObjectDTO } from '$lib/storage.server'

export interface PointDTO {
  id: string
  type: 'start' | 'top' | 'middle'
  x: number
  y: number
}

export interface TopoRouteDTO extends Omit<InferResultType<'topoRoutes', { route: true }>, 'path'> {
  points: PointDTO[]
}

export interface TopoDTO extends InferResultType<'topos'> {
  file: ObjectDTO
  routes: TopoRouteDTO[]
}

export const convertPathToPoints = (path: string): PointDTO[] => {
  if (path.trim() === '') {
    return []
  }

  return path
    .toUpperCase()
    .split(' ')
    .flatMap((point, index, points) => {
      const typeRaw = point[0]
      if (typeRaw === 'Z') {
        return []
      }

      const type = (() => {
        const nextTypeRaw = points[index + 1]?.[0]
        if (nextTypeRaw === 'Z') {
          return 'top'
        }

        switch (typeRaw) {
          case 'M':
            return 'start'

          case 'L':
            return 'middle'

          default:
            throw new Error(`Unsupported point type: ${point}`)
        }
      })()

      const [xRaw, yRaw] = point.substring(1).split(',')
      const x = Number(xRaw)
      const y = Number(yRaw)

      if (Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error(`Invalid point: ${point}`)
      }

      return [{ id: crypto.randomUUID(), type, x, y }]
    })
}

export const convertPointsToPath = (points: PointDTO[]): string => {
  const path = points
    .toSorted((a) => {
      if (a.type === 'start') {
        return -1
      }

      if (a.type === 'top') {
        return 1
      }

      return 0
    })
    .map((point) => {
      const command = (() => {
        switch (point.type) {
          case 'start':
            return `M`

          case 'middle':
          case 'top':
            return `L`
        }
      })()

      return `${command}${point.x},${point.y}`
    })
    .join(' ')

  if (points.some((point) => point.type === 'top')) {
    return `${path} Z`
  }

  return path
}
