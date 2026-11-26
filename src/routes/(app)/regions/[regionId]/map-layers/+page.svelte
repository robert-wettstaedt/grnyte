<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { entityHref } from '$lib/entities/href'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back } from '$lib/state/navigation.svelte'
  import LayerRow from './LayerRow.svelte'
  import MapLayersGate from './MapLayersGate.svelte'

  const screen = regionAdminScreen()
  const layers = $derived(screen.membership?.settings.mapLayers ?? [])
  const regionHref = $derived(entityHref('regions', screen.regionId))
</script>

<svelte:head>
  <title>{m.region_mapLayers()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<MapLayersGate backTo={regionHref}>
  <PageHeader onback={() => back(regionHref)} title={m.region_mapLayers()} />

  <div class="container mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8 pb-24 md:pb-8">
    {#if layers.length === 0}
      <p class="text-surface-600-400 text-sm">{m.region_mapLayersEmpty()}</p>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each layers as layer, index (index)}
          <li><LayerRow {layer} regionId={screen.regionId} /></li>
        {/each}
      </ul>
    {/if}

    <a
      class="btn preset-filled-surface-200-800 w-full"
      href={resolve('/(app)/regions/[regionId]/map-layers/add', { regionId: String(screen.regionId) })}
    >
      <Icon name="plus" size={16} />
      {m.region_mapLayerAdd()}
    </a>
  </div>
</MapLayersGate>
