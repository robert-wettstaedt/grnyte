<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { updateArea } from '$lib/entities/area/areas.remote'
  import { canEditArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seed.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const area = areaDetail(() => Number(page.params.id))

  const areaHref = $derived(entityHref('areas', Number(page.params.id)))

  const denied = $derived(
    area.data == null || canEditArea(global.userRegions, area.data)
      ? undefined
      : {
          description: m.form_noEditPermission(),
          primaryAction: { href: areaHref, label: m.areas_viewArea() },
          title: m.form_noPermissionTitle(),
        },
  )

  // Keyed on the loaded row's id and not the route parameter: the seed reads data, so it has to
  // wait for the row rather than write the previous entity's values under the new id. Re-seeding
  // on every snapshot would clobber edits in progress, which is what the guard is for.
  seedOnKeyChange(
    () => area.data?.id,
    () => {
      const data = area.data
      if (data == null) {
        return
      }
      updateArea.fields.set({
        description: data.description,
        id: data.id.toString(),
        name: data.name,
        parentFk: data.areas.at(-1)?.id.toString(),
        regionFk: data.regionFk.toString(),
      })
    },
  )
</script>

<svelte:head>
  <title>{m.areas_editArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={areaHref}
  {denied}
  form={updateArea}
  submitLabel={m.common_save()}
  title={m.areas_editArea()}
  waitFor={[{ notFound: m.areas_notFound(), resource: area }]}
>
  <AreaFormFields area={area.data!} form={updateArea} />
</Form>
