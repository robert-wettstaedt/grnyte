<script lang="ts">
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper/ZeroQueryWrapper.svelte'
  import { queries } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import ParkingContext from './ParkingContext.svelte'

  interface Props {
    children?: Snippet
  }
  const props: Props = $props()

  const query = $derived(queries.geolocation({ id: Number(page.params.id) }))
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty {query}>
  {#snippet children(geolocation)}
    {#if geolocation?.area == null}
      <Error status={404} />
    {:else}
      {#key geolocation.id}
        <ParkingContext {geolocation}>
          {@render props.children?.()}
        </ParkingContext>
      {/key}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
