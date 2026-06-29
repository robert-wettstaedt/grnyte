<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { canAddBlock } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import BlockForm from '$lib/entities/block/BlockForm.svelte'
  import { createBlock } from '$lib/entities/block/blocks.remote'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const area = areaDetail(() => Number(page.params.id))
</script>

<svelte:head>
  <title>{m.blocks_addBlock()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={area}>
  {#snippet ready(data)}
    {#if canAddBlock(global.userRegions, data)}
      <BlockForm
        area={data}
        form={createBlock}
        onCancel={() => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(data.id) }))}
        submitLabel={m.common_add()}
        title={m.blocks_addBlock()}
      />
    {:else}
      <ErrorState type="notfound" title={m.area_notFound()} />
    {/if}
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.area_notFound()} />
  {/snippet}
</QueryState>
