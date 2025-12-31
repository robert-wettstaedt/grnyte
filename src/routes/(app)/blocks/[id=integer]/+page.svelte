<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { blockWithPathname } from '$lib/db/utils.svelte'
  import { queries } from '$lib/db/zero'
  import { Progress } from '@skeletonlabs/skeleton-svelte'
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'spinner' }}
  query={queries.block(page.data, { blockId: Number(page.params.id) })}
>
  {#snippet children(block)}
    {@const { pathname } = (block == null ? undefined : blockWithPathname(block)) ?? {}}
    {#if pathname == null}
      <Error status={404} />
    {:else}
      {#await goto(pathname, { replaceState: true })}
        <div class="flex justify-center">
          <Progress value={null}>
            <Progress.Circle class="[--size:--spacing(12)]">
              <Progress.CircleTrack />
              <Progress.CircleRange />
            </Progress.Circle>
            <Progress.ValueText />
          </Progress>
        </div>
      {/await}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
