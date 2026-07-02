<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import Image from '$lib/components/Image/Image.svelte'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
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

  // Routes list vs. full-width topo images per block.
  let view = $state<'routes' | 'topos'>('routes')
</script>

{#if blocks.length > 0}
  <SegmentedControl value={view} onValueChange={(details) => (view = details.value as typeof view)}>
    <SegmentedControl.Control class="w-full">
      <SegmentedControl.Indicator class="preset-filled-primary-500" />
      <SegmentedControl.Item value="routes">
        <SegmentedControl.ItemText
          class="data-[state=checked]:text-primary-contrast-500 inline-flex items-center gap-2"
        >
          <Icon name="list" size={17} />
          {m.blocks_viewRoutes()}
        </SegmentedControl.ItemText>
        <SegmentedControl.ItemHiddenInput />
      </SegmentedControl.Item>
      <SegmentedControl.Item value="topos">
        <SegmentedControl.ItemText
          class="data-[state=checked]:text-primary-contrast-500 inline-flex items-center gap-2"
        >
          <Icon name="image" size={17} />
          {m.blocks_viewTopos()}
        </SegmentedControl.ItemText>
        <SegmentedControl.ItemHiddenInput />
      </SegmentedControl.Item>
    </SegmentedControl.Control>
  </SegmentedControl>
{/if}

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

    {#if view === 'topos'}
      {#if block.topoImages.length > 0}
        <div class="flex flex-col gap-3">
          {#each block.topoImages as image (image.path)}
            <Topo
              class="w-full"
              imagePath={image.path}
              width={image.width}
              height={image.height}
              alt={m.topo_alt()}
              lines={blockRoutes
                .filter((route) => route.topoImagePath === image.path && route.topoPoints != null)
                .map((route) => ({
                  id: route.id,
                  points: route.topoPoints ?? [],
                  band: getGradeBand(route.gradeFk),
                }))}
            />
          {/each}
        </div>
      {:else}
        <p class="text-surface-500 text-sm">{m.topo_none()}</p>
      {/if}
    {:else if blockRoutes.length > 0}
      <nav class="flex flex-col gap-1.5">
        {#each blockRoutes as route (route.id)}
          <RouteRow
            band={getGradeBand(route.gradeFk)}
            grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
            name={route.name}
            stars={route.rating}
            topoImagePath={route.topoImagePath}
            topoPoints={route.topoPoints}
          />
        {/each}
      </nav>
    {:else}
      <div class="flex items-center gap-2">
        {#each block.topoImages as image (image.path)}
          <span class="size-13 flex-none overflow-hidden rounded-xl">
            <Image
              path={image.path}
              alt={m.topo_alt()}
              class="h-full w-full"
              imgClass="object-cover"
              previewWidth={160}
            />
          </span>
        {/each}

        <p class="text-surface-500 text-sm">{m.blocks_noRoutes()}</p>
      </div>
    {/if}
  </section>
{/each}
