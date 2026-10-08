<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import { canAddBlock } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import BlockForm from '$lib/entities/block/BlockForm.svelte'
  import { createBlock } from '$lib/entities/block/blocks.remote'
  import { entityHref } from '$lib/entities/href'
  import FormGate from '$lib/forms/FormGate.svelte'
  import { noEditPermission } from '$lib/forms/gate'
  import { coordsFromParams } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const area = areaDetail(() => Number(page.params.id))
  // Location handed over by the quick-create map flow, landing the form pre-located.
  const initialLocation = $derived(coordsFromParams(page.url.searchParams))

  const areaHref = $derived(entityHref('areas', Number(page.params.id)))

  const denied = $derived.by(() => {
    const data = area.data
    if (data == null || canAddBlock(global.userRegions, data)) {
      return undefined
    }
    const view = { href: areaHref, label: m.areas_viewArea() }
    // An editor is refused because the area is the wrong type to hold this, not for permission.
    return checkRegionPermission(global.userRegions, [REGION_PERMISSION_EDIT], data.regionFk)
      ? { description: m.areas_notASectorBody(), primaryAction: view, title: m.areas_notASectorTitle() }
      : noEditPermission(view)
  })
</script>

<svelte:head>
  <title>{m.blocks_addBlock()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- The gate sits outside BlockForm, which seeds its pin from the area at mount. -->
<FormGate
  action={{ label: m.common_add() }}
  cancelTo={areaHref}
  {denied}
  seed={() => createBlock.fields.set({})}
  title={m.blocks_addBlock()}
  waitFor={[{ notFound: m.areas_notFound(), resource: area, whole: false }]}
>
  {#snippet children([area])}
    <!-- `seedKey` and not `{#key}`: BlockForm re-seeds its own pin when the area changes, so the
         `<form>` it owns is never destroyed and rebuilt under the remote form object. -->
    <BlockForm
      {area}
      form={createBlock}
      {initialLocation}
      cancelTo={areaHref}
      seedKey={area.id}
      submitLabel={m.common_add()}
      title={m.blocks_addBlock()}
    />
  {/snippet}
</FormGate>
