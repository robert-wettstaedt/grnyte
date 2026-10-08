<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import Form from '$lib/forms/Form.svelte'
  import { noEditPermission } from '$lib/forms/gate'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const parent = areaDetail(() => Number(page.params.id))

  const areaHref = $derived(entityHref('areas', Number(page.params.id)))

  const denied = $derived.by(() => {
    const area = parent.data
    if (area == null || canAddArea(global.userRegions, area)) {
      return undefined
    }
    const view = { href: areaHref, label: m.areas_viewArea() }
    // An editor is refused because the area is the wrong type to hold this, not for permission.
    return checkRegionPermission(global.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
      ? { description: m.areas_notAnAreaBody(), primaryAction: view, title: m.areas_notAnAreaTitle() }
      : noEditPermission(view)
  })
</script>

<svelte:head>
  <title>{m.areas_addArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={areaHref}
  {denied}
  form={createArea}
  seed={([parent]) => createArea.fields.set({ parentFk: parent.id.toString(), regionFk: parent.regionFk.toString() })}
  submitLabel={m.common_add()}
  title={parent.data == null ? m.areas_addArea() : m.areas_newAreaIn({ name: parent.data.name })}
  waitFor={[{ notFound: m.areas_notFound(), resource: parent, whole: false }]}
>
  {#snippet fields([parent])}
    <AreaFormFields area={parent} form={createArea} />
  {/snippet}
</Form>
