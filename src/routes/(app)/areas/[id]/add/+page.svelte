<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const parent = areaDetail(() => Number(page.params.id))

  $effect(() => {
    createArea.fields.set({
      parentFk: parent.data?.id.toString(),
      regionFk: parent.data?.regionFk.toString(),
    })
  })
</script>

<svelte:head>
  <title>{m.areas_addArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={parent}>
  {#snippet ready(area)}
    {#if canAddArea(global.userRegions, area)}
      <Form
        form={createArea}
        onCancel={() => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(area.id) }))}
        submitLabel={m.areas_createArea()}
        title={m.areas_newArea()}
      >
        <AreaFormFields {area} form={createArea} />
      </Form>
    {:else}
      <ErrorState type="notfound" title={m.area_notFound()} />
    {/if}
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.area_notFound()} />
  {/snippet}
</QueryState>
