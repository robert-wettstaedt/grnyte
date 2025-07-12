import { calcMiddlePoint } from '$lib/components/TopoViewer/components/Route/lib'
import type { InferResultType } from '$lib/db/types'
import type { RowWithRelations, Schema } from '$lib/db/zero'
import type { FileDTO } from '$lib/nextcloud'
import type { PullRow } from '@rocicorp/zero'

export interface PointDTO {
  id: string
  type: 'start' | 'top' | 'middle'
  x: number
  y: number
}

export type TopoRouteDTO<
  T extends RowWithRelations<'topoRoutes', Schema, { route: true }> = RowWithRelations<
    'topoRoutes',
    Schema,
    { route: true }
  >,
> = Omit<T, 'id' | 'path'> & {
  id?: InferResultType<'topoRoutes'>['id']
  points: PointDTO[]
}

export type TopoDTO<T extends PullRow<'topos', Schema> = PullRow<'topos', Schema>> = T & {
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

export function enrichTopo<T extends RowWithRelations<'topos', Schema, { file: true; routes: true }>>(
  topo: T,
): TopoDTO<T> {
  if (topo.file == null) {
    throw new Error('Topo file is required')
  }

  const routes =
    topo.routes
      .map(({ path, ...route }): TopoRouteDTO => {
        return { ...route, points: convertPathToPoints(path ?? '') } as TopoRouteDTO
      })
      .toSorted((a, b) => {
        const meanA = calcMiddlePoint(a.points)?.x ?? 0
        const meanB = calcMiddlePoint(b.points)?.x ?? 0

        // Sort routes by the mean x value of the topo
        return meanA - meanB
      }) ?? []

  return { ...topo, file: topo.file, routes }
}

export function sortRoutesByTopo<T extends PullRow<'topos', Schema>, R extends PullRow<'routes', Schema>>(
  routes: R[],
  topos: TopoDTO<T>[],
): R[] {
  return routes.toSorted((a, b) => {
    const topoIndexA = topos.findIndex((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === a.id))
    const topoIndexB = topos.findIndex((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === b.id))

    // Sort routes by order of the topo they are in
    if (topoIndexA !== topoIndexB) {
      return topoIndexA - topoIndexB
    }

    const topoRouteA = topos[topoIndexA]?.routes.find((topoRoute) => topoRoute.routeFk === a.id)
    const topoRouteB = topos[topoIndexA]?.routes.find((topoRoute) => topoRoute.routeFk === b.id)

    const meanA = calcMiddlePoint(topoRouteA?.points ?? [])?.x ?? 0
    const meanB = calcMiddlePoint(topoRouteB?.points ?? [])?.x ?? 0

    // Sort routes by the mean x value of the topo
    return meanA - meanB
  })
}
