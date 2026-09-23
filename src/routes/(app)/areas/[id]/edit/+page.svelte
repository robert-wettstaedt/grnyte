<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { updateArea } from '$lib/entities/area/areas.remote'
  import { canEditArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const area = areaDetail(() => Number(page.params.id))

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

<QueryState notFound={m.areas_notFound()} resource={area}>
  {#snippet ready(data)}
    {#if canEditArea(global.userRegions, data)}
      <Form
        form={updateArea}
        cancelTo={entityHref('areas', data.id)}
        submitLabel={m.common_save()}
        title={m.areas_editArea()}
      >
        <AreaFormFields area={data} form={updateArea} />
      </Form>
    {:else}
      <ErrorState
        type="generic"
        title={m.form_noPermissionTitle()}
        description={m.form_noEditPermission()}
        primaryAction={{
          href: entityHref('areas', data.id),
          label: m.areas_viewArea(),
        }}
      />
    {/if}
  {/snippet}
</QueryState>
