<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper/ZeroQueryWrapper.svelte'
  import { queries } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import TopoContext from './TopoContext.svelte'
  import { afterNavigate, beforeNavigate } from '$app/navigation'
  import { selectedRouteStore } from '$lib/components/TopoViewer'

  interface Props {
    children?: Snippet
  }
  const props: Props = $props()

  beforeNavigate(() => {
    selectedRouteStore.set(null)
  })
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'spinner' }}
  showEmpty
  query={queries.topo({ topoId: Number(page.params.topoId) })}
>
  {#snippet children(topo)}
    {#if topo == null}
      <Error status={404} />
    {:else}
      {#key topo.id}
        <TopoContext {topo}>
          {@render props.children?.()}
        </TopoContext>
      {/key}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
