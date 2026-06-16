<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail, areaList } from '$lib/entities/area/resources.svelte'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import { sheetState } from '../../Modal/sheetState.svelte'
  import AreaActions from './AreaActions.svelte'
  import AreaDescription from './AreaDescription.svelte'
  import AreaList from './AreaList.svelte'
  import GradeHistogram from './GradeHistogram.svelte'

  const global = getGlobalState()

  // Getters keep the resources live across navigation between areas (e.g. when
  // tapping a sub-area) — the underlying queries re-target as the param changes.
  const area = areaDetail(() => Number(page.params.id))
  const subAreas = areaList(() => ({ parentFk: Number(page.params.id) }))

  // Every route beneath this area (the `areaId` filter matches descendants), so
  // the histogram reflects the whole sub-tree rather than only directly attached
  // routes.
  const routes = routeList(() => ({ areaId: Number(page.params.id) }))

  const countByGrade = $derived.by(() => {
    const counts = new SvelteMap<number, number>()
    for (const route of routes.data) {
      if (route.gradeFk != null) {
        counts.set(route.gradeFk, (counts.get(route.gradeFk) ?? 0) + 1)
      }
    }
    return counts
  })

  const ungradedCount = $derived(routes.data.filter((route) => route.gradeFk == null).length)
  const gradedCount = $derived(routes.data.length - ungradedCount)

  const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

  // Only worth naming the region when the user belongs to more than one — with a
  // single region it's implied and would just be noise in the breadcrumb.
  const regionName = $derived.by(() => {
    if (global.userRegions.length <= 1 || area.data == null) {
      return null
    }
    return global.userRegions.find((region) => region.regionFk === area.data!.regionFk)?.name ?? null
  })

  // The shared Modal renders its header from sheetState, so feed it the title
  // (type · name) and a breadcrumb subtitle built from the region and ancestors.
  $effect(() => {
    const data = area.data
    sheetState.title = data == null ? '' : `${capitalize(data.type)} · ${data.name}`
    sheetState.subtitle = data != null && (regionName != null || data.areas.length > 0) ? breadcrumb : null
  })
</script>

<svelte:head>
  <title>{area.data?.name ?? m.areas_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={area}>
  {#snippet ready(detail)}
    <div class="space-y-5">
      <AreaActions area={detail} />

      {#if detail.description != null}
        <AreaDescription description={detail.description} />
      {/if}

      {#if routes.data.length > 0}
        <section class="space-y-2">
          <div class="flex items-baseline justify-between">
            <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">{m.area_grades()}</h2>
            <span class="text-surface-600-400 text-xs tabular-nums">
              {m.area_gradedCount({ count: gradedCount })}
            </span>
          </div>

          <GradeHistogram
            {countByGrade}
            grades={global.grades}
            gradingScale={global.gradingScale}
            ungraded={ungradedCount}
          />
        </section>

        <a
          class="border-surface-300-700 bg-surface-200-800 hover:bg-surface-300-700 flex items-center gap-3 rounded-xl border p-3 transition-colors"
          href={resolve('/(app)/(shell)/(map)/areas/[id]/routes', { id: page.params.id! })}
        >
          <span
            class="bg-primary-500/15 text-primary-500 flex size-11 flex-none items-center justify-center rounded-xl"
          >
            <Icon name="list" size={22} />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">{m.area_allRoutesCount({ count: routes.data.length })}</span>
            <span class="text-surface-600-400 block text-xs">{m.area_allRoutesHint()}</span>
          </span>
          <Icon name="chevron-right" size={18} class="text-surface-500 flex-none" />
        </a>
      {/if}

      {#if detail.type === 'crag'}
        <!-- <BlocksList areaFk={area.id} basePath={resolve('/bla')} regionFk={area.regionFk} sortable={false} /> -->
      {:else}
        <AreaList areas={subAreas.data} />
      {/if}
    </div>
  {/snippet}

  {#snippet empty()}
    <p class="text-surface-600-400 py-8 text-center">{m.area_notFound()}</p>
  {/snippet}
</QueryState>

{#snippet breadcrumb()}
  {#if area.data != null}
    <Breadcrumb area={area.data} userRegions={global.userRegions} />
  {/if}
{/snippet}
