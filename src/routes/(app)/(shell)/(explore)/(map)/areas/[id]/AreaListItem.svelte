<script lang="ts">
  import { resolve } from '$app/paths'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { countRoutesByGrade } from '$lib/entities/grade/counts'
  import { routeMapList } from '$lib/entities/route/resources.svelte'
  import { summaryOf } from '$lib/zero/resource.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()

  // Every route beneath the area (the `areaId` filter matches descendants), as slim rows: the donut needs grades only.
  const routes = routeMapList(() => ({ areaId: area.id }))

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
