<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { getGradeBand } from '$lib/entities/grade/color'
  import type { RouteListItem } from '$lib/entities/route/dto'
  import { userLocation } from '$lib/map/geolocation.svelte'
  import { formatDistance } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { SvelteMap } from 'svelte/reactivity'

  interface Props {
    /** Blocks beneath the area, already ordered by the query. */
    blocks: BlockDetail[]
    /** Every route beneath the area; grouped here by `blockFk`. */
    routes: RouteListItem[]
  }

  const { blocks, routes }: Props = $props()

  const global = getGlobalState()

  const routesByBlock = $derived.by(() => {
    const map = new SvelteMap<number, RouteListItem[]>()
    for (const route of routes) {
      const list = map.get(route.blockFk)
      if (list == null) {
        map.set(route.blockFk, [route])
      } else {
        list.push(route)
      }
    }
    return map
  })

  // Only request location once there's a block to measure against, so areas with
  // no geolocated blocks never trigger a permission dialog. Live-updates as the
  // user moves through the area.
  const hasGeo = $derived(blocks.some((block) => block.geolocation != null))
  const location = userLocation(() => hasGeo)

  // Mirrors the routes page: strip the redundant scale prefix (e.g. `FB 6A+`).
  const gradeLabel = (gradeFk: number | undefined): string => {
    if (gradeFk == null) {
      return '—'
    }
    const value = global.grades.find((grade) => grade.id === gradeFk)?.[global.gradingScale]
    if (value == null) {
      return '—'
    }
    return value.startsWith(`${global.gradingScale} `) ? value.slice(global.gradingScale.length + 1) : value
  }
</script>

{#each blocks as block (block.id)}
  {@const blockRoutes = routesByBlock.get(block.id) ?? []}
  {@const distance =
    block.geolocation != null && location.current != null
      ? formatDistance(location.current, { lat: block.geolocation.lat, long: block.geolocation.long })
      : null}
  <section class="space-y-2">
    <a
      class="group flex items-center justify-between gap-2"
      href={resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(block.id) })}
    >
      <span class="flex min-w-0 items-center gap-1">
        <h2
          class="text-surface-600-400 group-hover:text-primary-400 truncate text-sm font-bold tracking-wider uppercase transition-colors"
        >
          {block.name}
        </h2>
        <Icon
          name="chevron-right"
          size={14}
          class="text-surface-500 group-hover:text-primary-400 shrink-0 transition-colors"
        />
      </span>

      <span class="text-surface-500 flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tabular-nums">
        {#if block.geolocation == null}
          <Icon name="alert-triangle" size={14} class="text-warning-500" title={m.blocks_noLocation()} />
        {:else if distance != null}
          <span class="flex items-center gap-1">
            <Icon name="map-pin" size={12} />
            {distance}
          </span>
        {/if}
        {#if blockRoutes.length > 0}
          {#if block.geolocation == null || distance != null}
            <span class="opacity-40" aria-hidden="true">·</span>
          {/if}
          {m.routes_routesCount({ count: blockRoutes.length })}
        {/if}
      </span>
    </a>

    {#if blockRoutes.length > 0}
      <nav class="flex flex-col gap-1.5">
        {#each blockRoutes as route (route.id)}
          <RouteRow
            band={getGradeBand(route.gradeFk)}
            grade={gradeLabel(route.gradeFk)}
            name={route.name}
            stars={route.rating}
          />
        {/each}
      </nav>
    {:else}
      <p class="text-surface-500 text-sm">{m.blocks_noRoutes()}</p>
    {/if}
  </section>
{/each}
