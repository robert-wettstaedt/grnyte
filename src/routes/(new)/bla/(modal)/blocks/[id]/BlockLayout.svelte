<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper/ZeroQueryWrapper.svelte'
  import { queries } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import BlockContext from './BlockContext.svelte'

  interface Props {
    children?: Snippet
  }
  const props: Props = $props()

  const query = $derived(queries.block({ blockId: Number(page.params.id) }))
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty {query}>
  {#snippet children(block)}
    {#if block == null}
      <Error status={404} />
    {:else}
      {#key block.id}
        <BlockContext {block}>
          {@render props.children?.()}
        </BlockContext>
      {/key}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
