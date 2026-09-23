<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { canAddBlock } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import BlockForm from '$lib/entities/block/BlockForm.svelte'
  import { createBlock } from '$lib/entities/block/blocks.remote'
  import { entityHref } from '$lib/entities/href'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { coordsFromParams } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const area = areaDetail(() => Number(page.params.id))
  // Location handed over by the quick-create map flow, landing the form pre-located.
  const initialLocation = $derived(coordsFromParams(page.url.searchParams))

  // The fields live on a module-level remote singleton, so they outlive both this page and a
  // change of area. BlockForm re-seeds its own once-at-mount state off `seedKey` below.
  seedOnKeyChange(
    () => page.params.id,
    () => createBlock.fields.set({}),
  )
</script>

<svelte:head>
  <title>{m.blocks_addBlock()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState notFound={m.areas_notFound()} resource={area}>
  {#snippet ready(data)}
    {#if canAddBlock(global.userRegions, data)}
      <!-- `seedKey` and not `{#key}`: BlockForm re-seeds its own pin when the area changes, so
           the `<form>` it owns is never destroyed and rebuilt under the remote form object. -->
      <BlockForm
        area={data}
        form={createBlock}
        {initialLocation}
        cancelTo={entityHref('areas', data.id)}
        seedKey={data.id}
        submitLabel={m.common_add()}
        title={m.blocks_addBlock()}
      />
    {:else if !checkRegionPermission(global.userRegions, [REGION_PERMISSION_EDIT], data.regionFk)}
      <ErrorState
        type="generic"
        title={m.form_noPermissionTitle()}
        description={m.form_noEditPermission()}
        primaryAction={{
          href: entityHref('areas', data.id),
          label: m.areas_viewArea(),
        }}
      />
    {:else}
      <!-- Not a permission problem: the area is the wrong type to hold this. -->
      <ErrorState
        type="generic"
        title={m.areas_notASectorTitle()}
        description={m.areas_notASectorBody()}
        primaryAction={{
          href: entityHref('areas', data.id),
          label: m.areas_viewArea(),
        }}
      />
    {/if}
  {/snippet}
</QueryState>
