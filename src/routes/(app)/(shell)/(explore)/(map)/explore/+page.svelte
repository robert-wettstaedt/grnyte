<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import EmptyState, { EMPTY_CTA_PRIMARY } from '$lib/components/EmptyState/EmptyState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { canAddArea } from '$lib/entities/area/permissions'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  // Two empty maps, two reasons. Mostly this is the founder standing on their own brand-new
  // region, the first link of the area → block → route chain.
  //
  // A region-less user is normally bounced to /regions/new (authGuard on a document load, the
  // (app) layout on an in-app navigation), but the client half of that needs a Zero replica that
  // has completed, and offline or on a dead sync socket it never does. So the older no-region copy
  // stays as the safety net, rather than leaving them on a blank map with nothing said.
  //
  // `isEmpty` rather than a length check, so this cannot flash while Zero is still syncing. The
  // same unfiltered query CreateOnMap already runs, so Zero dedupes it.
  const global = getGlobalState()
  const areas = areaList()

  const addable = $derived(
    global.userRegions.filter((region) => canAddArea(global.userRegions, { regionFk: region.regionFk, type: 'area' })),
  )

  // Named when there is exactly one region to name. Somebody in several with nothing in any of
  // them is rare enough not to guess which one they meant.
  const title = $derived(
    global.userRegions.length === 1
      ? m.region_emptyTitle({ name: global.userRegions[0].name })
      : m.region_emptyTitleAny(),
  )

  // Prefills the form's region select when only one of their regions can take an area.
  const addHref = $derived(
    addable.length === 1
      ? `${resolve('/(app)/areas/add')}?regionFk=${addable[0].regionFk}`
      : resolve('/(app)/areas/add'),
  )
</script>

<svelte:head>
  <title>{m.explore_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if global.userRegions.length === 0 || areas.isEmpty}
  <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
    <div class="card preset-filled-surface-100-900 pointer-events-auto max-w-sm shadow-xl">
      {#if global.userRegions.length === 0}
        <!-- The bounce did not fire, so this is the last thing standing between them and an
             unexplained blank map. -->
        <div class="px-6 py-7 text-center">
          <h2 class="text-surface-950-50 mb-2 text-xl font-bold tracking-tight">{m.explore_noRegionTitle()}</h2>
          <p class="text-surface-600-400 text-pretty">{m.explore_noRegionBody()}</p>
        </div>
      {:else if addable.length > 0}
        <EmptyState motif="region" {title} body={m.region_emptyBody()}>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()'d above, plus a query string -->
          <a class={EMPTY_CTA_PRIMARY} href={addHref}>
            <Icon name="area" size={20} />
            {m.region_emptyCta()}
          </a>
        </EmptyState>
      {:else}
        <!-- A read-only member of a region nobody has filled in yet: nothing to offer them, but
             say why the map is blank rather than leaving them to guess. -->
        <p class="text-surface-600-400 px-6 py-7 text-center text-pretty">{m.region_emptyReadOnly()}</p>
      {/if}
    </div>
  </div>
{/if}
