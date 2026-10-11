<script lang="ts">
  import { resolve } from '$app/paths'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { countRoutesByGrade } from '$lib/entities/grade/counts'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { summaryOf } from '$lib/zero/resource.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()

  // Each card owns a query for every route beneath its area: the `areaId`
  // filter matches descendants via the route's `areaIds`, so the donut reflects
  // the whole sub-tree, not only routes attached directly to this area.
  const routes = routeList(() => ({ areaId: area.id }))

  const total = $derived(summaryOf(routes.phase, routes.data.length))
  const countByGrade = $derived(countRoutesByGrade(routes.data))
</script>

<!-- The donut draws from the sub-tree's routes on hand; an arriving zero stays blank. -->
<AreaRow
  countByGrade={total != null ? countByGrade : undefined}
  description={area.description}
  href={resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.id) })}
  name={area.name}
  {total}
/>
