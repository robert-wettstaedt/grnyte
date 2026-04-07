<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper/ZeroQueryWrapper.svelte'
  import { queries } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import AreaContext from './AreaContext.svelte'

  interface Props {
    children?: Snippet
  }
  const props: Props = $props()

  const query = $derived(queries.area({ id: Number(page.params.id) }))
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty {query}>
  {#snippet children(area)}
    {#if area == null}
      <Error status={404} />
    {:else}
      {#key area.id}
        <AreaContext {area}>
          {@render props.children?.()}
        </AreaContext>
      {/key}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
