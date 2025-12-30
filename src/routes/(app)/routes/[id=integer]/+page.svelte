<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { routeWithPathname } from '$lib/db/utils.svelte'
  import { queries } from '$lib/db/zero'
  import { Progress } from '@skeletonlabs/skeleton-svelte'
</script>

{#if page.params.id == null}
  <Error status={404} />
{:else}
  <ZeroQueryWrapper
    loadingIndicator={{ type: 'spinner' }}
    query={queries.route(page.data, { routeSlug: page.params.id })}
  >
    {#snippet children(block)}
      {@const route = block?.routes.at(0)}
      {@const { pathname } = (route == null ? undefined : routeWithPathname({ ...route, block })) ?? {}}
      {#if pathname == null}
        <Error status={404} />
      {:else}
        {#await goto(pathname, { replaceState: true })}
          <div class="flex justify-center">
            <Progress size="size-12" value={null} />
          </div>
        {/await}
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
