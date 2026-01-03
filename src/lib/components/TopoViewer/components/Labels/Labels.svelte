<script lang="ts">
  import type { PointDTO, TopoRouteDTO } from '$lib/topo'
  import type { Coordinates } from '../Route'
  import { calcMiddlePoint } from '../Route/lib'

  interface Props {
    getRouteKey?: ((route: TopoRouteDTO, index: number) => number) | null
    routes: TopoRouteDTO[]
    scale: number
  }

  const { getRouteKey, routes, scale }: Props = $props()

  interface Label extends Coordinates {
    text: string
  }

  const COORD_Y_ADDITIVE = {
    middle: 0,
    start: 40,
    top: -70,
  }

  const labels = $derived.by((): Label[] => {
    if (getRouteKey == null) {
      return []
    }

    const groupRoutes = (type: PointDTO['type']) => {
      return routes.reduce(
        (obj, route) => {
          const point = calcMiddlePoint(route.points.filter((point) => point.type === type))
          const key = point == null ? null : `${point.x}-${point.y + COORD_Y_ADDITIVE[type]}`
          const newObj = key == null ? null : { [key]: [...(obj[key] ?? []), route] }
          return { ...obj, ...newObj }
        },
        {} as Record<string, TopoRouteDTO[] | undefined>,
      )
    }

    const entryToLabel = ([key, entries]: [string, TopoRouteDTO[] | undefined]): Label => {
      const [x, y] = key.split('-')

      return {
        x: Number(x),
        y: Number(y),
        text:
          entries
            ?.map((route) =>
              getRouteKey(
                route,
                routes.findIndex((_route) => route.id === _route.id),
              ),
            )
            .filter(Boolean)
            .join(', ') ?? '',
      }
    }

    const starts = groupRoutes('start')
    const startsEntries = Object.entries(starts)
    const startsArr = startsEntries.map(entryToLabel)

    const hasOverlappingPoints = routes.some((route) => {
      const otherRoutes = routes.filter((r) => r.id !== route.id)

      return route.points.some((point) =>
        otherRoutes.some((otherRoute) =>
          otherRoute.points.some((otherPoint) => otherPoint.x === point.x && otherPoint.y === point.y),
        ),
      )
    })

    if (hasOverlappingPoints) {
      const tops = groupRoutes('top')
      const topsEntries = Object.entries(tops)
      const topsArr = topsEntries.map(entryToLabel)

      return [...startsArr, ...topsArr]
    }

    return startsArr
  })
</script>

{#each labels as label}
  <div
    class="route-label"
    data-testid="route-label"
    style:font-size={25 * scale + 'px'}
    style:left={label.x * scale + 'px'}
    style:top={label.y * scale + 'px'}
  >
    {label.text}
  </div>
{/each}

<style>
  .route-label {
    background: rgba(0, 0, 0, 0.75);
    color: #ff7f0e;
    padding: 0.25rem;
    position: absolute;
    transform: translateX(-50%);
    print-color-adjust: exact !important;
  }
</style>
