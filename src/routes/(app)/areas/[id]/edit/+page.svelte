<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { areaActionSchema } from '$lib/entities/area/dto'
  import { canEditArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { updateArea } from '$lib/entities/area/writes'
  import { entityHref } from '$lib/entities/href'
  import Form from '$lib/forms/Form.svelte'
  import { noEditPermission } from '$lib/forms/gate'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const store = createFormStore(areaActionSchema)
  const global = getGlobalState()
  const area = areaDetail(() => Number(page.params.id))

  const areaHref = $derived(entityHref('areas', Number(page.params.id)))

  const denied = $derived(
    area.data == null || canEditArea(global.userRegions, area.data)
      ? undefined
      : noEditPermission({ href: areaHref, label: m.areas_viewArea() }),
  )
</script>

<svelte:head>
  <title>{m.areas_editArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={areaHref}
  {denied}
  {store}
  submit={updateArea}
  seed={([area]) => ({
    description: area.description,
    id: area.id.toString(),
    name: area.name,
    parentFk: area.areas.at(-1)?.id.toString(),
    regionFk: area.regionFk.toString(),
  })}
  submitLabel={m.common_save()}
  title={m.areas_editArea()}
  waitFor={[{ notFound: m.areas_notFound(), resource: area, whole: false }]}
>
  {#snippet fields([area])}
    <AreaFormFields {area} form={store} />
  {/snippet}
</Form>
