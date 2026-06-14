<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import GradeDonut from './GradeDonut.svelte'

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

<a
  class="border-surface-300-700 bg-surface-200-800 hover:bg-surface-300-700 flex items-center gap-3 rounded-xl border p-2.5 transition-colors"
  href={resolve('/(app)/(map)/areas/[id]', { id: String(area.id) })}
>
  <GradeDonut {countByGrade} total={routes.data.length} size={52} />

  <div class="min-w-0 flex-1">
    <p class="truncate font-semibold">{area.name}</p>

    {#if area.description}
      <!-- `disableLinks` strips the anchors the markdown would otherwise emit
           (mentions, links) so this preview can live inside the card's <a>;
           `short` resolves references to names, renders grades as badges and
           collapses the description to a single truncated line. -->
      <Markdown className="short" disableLinks encloseReferences="strong" markdown={area.description} />
    {/if}
  </div>

  <Icon name="chevron-right" size={18} class="text-surface-500 flex-none" />
</a>
