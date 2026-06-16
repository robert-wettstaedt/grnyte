<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { sheetState } from '../../../Modal/sheetState.svelte'

  const global = getGlobalState()

  // Getters keep the resources live across navigation, mirroring the area page.
  const area = areaDetail(() => Number(page.params.id))
  const routes = routeList(() => ({ areaId: Number(page.params.id) }))

  const gradeLabel = (gradeFk: number | undefined): string => {
    if (gradeFk == null) {
      return '—'
    }
    const value = global.grades.find((grade) => grade.id === gradeFk)?.[global.gradingScale]
    if (value == null) {
      return '—'
    }
    // Grade strings carry the scale as a redundant prefix (e.g. `FB 6A+`).
    return value.startsWith(`${global.gradingScale} `) ? value.slice(global.gradingScale.length + 1) : value
  }

  // Hardest first, with ungraded routes sinking to the bottom.
  const sorted = $derived([...routes.data].sort((a, b) => (b.gradeFk ?? -Infinity) - (a.gradeFk ?? -Infinity)))

  // The shared Modal renders its header from sheetState; label it with the area.
  $effect(() => {
    sheetState.title = area.data == null ? m.area_allRoutes() : `${m.area_allRoutes()} · ${area.data.name}`
    sheetState.subtitle = null
    sheetState.headerLeft = headerLeft
  })
</script>

<svelte:head>
  <title>
    {area.data == null ? m.area_allRoutes() : `${m.area_allRoutes()} · ${area.data.name}`} – {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

{#snippet headerLeft()}
  <button
    class="btn-icon preset-filled-surface-200-800"
    onclick={() => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: page.params.id! }))}
    title={m.common_back()}
  >
    <Icon name="arrow-left" />
  </button>
{/snippet}

<QueryState resource={routes}>
  {#snippet ready()}
    <nav class="flex flex-col gap-1.5">
      {#each sorted as route (route.id)}
        <RouteRow
          band={getGradeBand(route.gradeFk, global.grades)}
          grade={gradeLabel(route.gradeFk)}
          name={route.name}
          stars={route.rating}
        />
      {/each}
    </nav>
  {/snippet}
</QueryState>
