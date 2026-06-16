<script lang="ts">
  import { resolve } from '$app/paths'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { SvelteMap } from 'svelte/reactivity'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()

  // Each card owns a query for every route beneath its area — the `areaId`
  // filter matches descendants via the route's `areaIds`, so the donut reflects
  // the whole sub-tree, not just routes attached directly to this area.
  const routes = routeList(() => ({ areaId: area.id }))

  const countByGrade = $derived.by(() => {
    const counts = new SvelteMap<number, number>()
    for (const route of routes.data) {
      if (route.gradeFk != null) {
        counts.set(route.gradeFk, (counts.get(route.gradeFk) ?? 0) + 1)
      }
    }
    return counts
  })
</script>

<AreaRow
  {countByGrade}
  description={area.description}
  href={resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(area.id) })}
  name={area.name}
  total={routes.data.length}
/>
