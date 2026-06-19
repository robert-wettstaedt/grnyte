<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { updateArea } from '$lib/entities/area/areas.remote'
  import { canEditArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const area = areaDetail(() => Number(page.params.id))

  // Prefill once per area; reading live data on every change would clobber the user's edits.
  let prefilledId: number | undefined
  $effect(() => {
    const data = area.data
    if (data != null && data.id !== prefilledId) {
      prefilledId = data.id
      updateArea.fields.set({
        description: data.description ?? '',
        id: data.id.toString(),
        name: data.name,
        parentFk: data.areas.at(-1)?.id.toString(),
        regionFk: data.regionFk.toString(),
        type: data.type,
      })
    }
  })
</script>

<svelte:head>
  <title>{m.areas_editArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={area}>
  {#snippet ready(data)}
    {#if canEditArea(global.userRegions, data)}
      <Form
        form={updateArea}
        onCancel={() => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(data.id) }))}
        submitLabel={m.common_save()}
        title={m.areas_editArea()}
      >
        <AreaFormFields area={data} form={updateArea} />
      </Form>
    {:else}
      <ErrorState type="notfound" title={m.area_notFound()} />
    {/if}
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.area_notFound()} />
  {/snippet}
</QueryState>
