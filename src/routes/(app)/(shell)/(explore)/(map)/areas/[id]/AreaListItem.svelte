<script lang="ts">
  import { resolve } from '$app/paths'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { countRoutesByGrade } from '$lib/entities/grade/counts'
  import { routeList } from '$lib/entities/route/resources.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()

  // Each card owns a query for every route beneath its area: the `areaId`
  // filter matches descendants via the route's `areaIds`, so the donut reflects
  // the whole sub-tree, not only routes attached directly to this area.
  const routes = routeList(() => ({ areaId: area.id }))

  const countByGrade = $derived(countRoutesByGrade(routes.data))
</script>

<AreaRow
  {countByGrade}
  description={area.description}
  href={resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.id) })}
  name={area.name}
  total={routes.data.length}
/>
