<script lang="ts">
  import { page } from '$app/state'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { getGradeColor } from '$lib/entities/grade/color'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { sheetState } from '../../../Modal/sheetState.svelte'

  const app = getGlobalState()

  // Getters keep the resources live across navigation, mirroring the area page.
  const area = areaDetail(() => Number(page.params.id))
  const routes = routeList(() => ({ areaId: Number(page.params.id) }))

  // Neutral grey for routes without a grade, matching the donut/histogram.
  const UNGRADED_COLOR = '#a1a1aa'

  const gradeLabel = (gradeFk: number | undefined): string => {
    if (gradeFk == null) {
      return '—'
    }
    const value = app.grades.find((grade) => grade.id === gradeFk)?.[app.gradingScale]
    if (value == null) {
      return '—'
    }
    // Grade strings carry the scale as a redundant prefix (e.g. `FB 6A+`).
    return value.startsWith(`${app.gradingScale} `) ? value.slice(app.gradingScale.length + 1) : value
  }

  const gradeColor = (gradeFk: number | undefined): string =>
    gradeFk == null ? UNGRADED_COLOR : getGradeColor(gradeFk)

  // Hardest first, with ungraded routes sinking to the bottom.
  const sorted = $derived([...routes.data].sort((a, b) => (b.gradeFk ?? -Infinity) - (a.gradeFk ?? -Infinity)))

  // The shared Modal renders its header from sheetState; label it with the area.
  $effect(() => {
    sheetState.title = area.data == null ? m.area_allRoutes() : `${m.area_allRoutes()} · ${area.data.name}`
    sheetState.subtitle = null
  })
</script>

<QueryState resource={routes}>
  {#snippet ready()}
    <nav class="flex flex-col gap-1.5">
      {#each sorted as route (route.id)}
        <div class="border-surface-300-700 bg-surface-200-800 flex items-center gap-3 rounded-xl border p-2.5">
          <span class="size-2.5 flex-none rounded-full" style="background-color: {gradeColor(route.gradeFk)}"></span>
          <span class="w-10 flex-none text-sm font-semibold tabular-nums">{gradeLabel(route.gradeFk)}</span>
          <span class="min-w-0 flex-1 truncate">{route.name}</span>
        </div>
      {/each}
    </nav>
  {/snippet}
</QueryState>
