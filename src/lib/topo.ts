import type { InferResultType } from '$lib/db/types'
import type { FileDTO } from '$lib/nextcloud'

export interface PointDTO {
  id: string
  type: 'start' | 'top' | 'middle'
  x: number
  y: number
}

export interface TopoRouteDTO extends Omit<InferResultType<'topoRoutes', { route: true }>, 'id' | 'path'> {
  id?: InferResultType<'topoRoutes'>['id']
  points: PointDTO[]
}

export interface TopoDTO extends InferResultType<'topos'> {
  file: FileDTO
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
    .toSorted((a, b) => {
      const aOrder = a.type === 'start' ? -1 : a.type === 'top' ? 1 : 0
      const bOrder = b.type === 'start' ? -1 : b.type === 'top' ? 1 : 0

      if (aOrder === bOrder) {
        return a.x + a.y - (b.x + b.y)
      }

      return aOrder - bOrder
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
