<!-- The states a map-layers screen shows instead of itself: not an admin, the region row not here
     yet, layers this version cannot read, or (on a layer's page) no such layer. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import { entityHref } from '$lib/entities/href'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'
  import RegionScreen from '../RegionScreen.svelte'

  interface Props {
    backTo: string
    children: Snippet
    notFound?: boolean
    ready?: boolean
  }

  const { backTo, children, notFound = false, ready = true }: Props = $props()
  const screen = regionAdminScreen()
</script>

{#if !screen.isAdmin}
  <RegionScreen backTo={entityHref('regions', screen.regionId)} title={m.region_mapLayers()}>
    <RegionAdminRequired regionId={screen.regionId} />
  </RegionScreen>
{:else if screen.membership?.synced !== true}
  <!-- Nothing until the region row is here: an empty list reads as "no layers", and saved from a
       form it is a valid submission that removes them all. -->
  <RegionScreen {backTo} title={m.region_mapLayers()} />
{:else if !screen.membership.layersComplete}
  <!-- Before `ready`: a layer page never seeds over unreadable layers, so it would wait forever. A
       save writes the whole list back and would drop the layers this version cannot read. -->
  <RegionScreen {backTo} title={m.region_mapLayers()}>
    <ErrorState
      type="generic"
      title={m.region_mapLayersUnreadableTitle()}
      description={m.region_mapLayersUnreadableBody()}
    />
  </RegionScreen>
{:else if !ready}
  <RegionScreen {backTo} title={m.region_mapLayers()} />
{:else if notFound}
  <RegionScreen {backTo} title={m.region_mapLayers()}>
    <ErrorState
      type="notfound"
      title={m.region_mapLayerNotFoundTitle()}
      description={m.region_mapLayerNotFoundBody()}
      primaryAction={{
        href: resolve('/(app)/regions/[regionId]/map-layers', { regionId: String(screen.regionId) }),
        label: m.region_mapLayers(),
      }}
    />
  </RegionScreen>
{:else}
  {@render children()}
{/if}
