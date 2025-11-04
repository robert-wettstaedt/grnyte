<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { areaWithPathname } from '$lib/db/utils.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
</script>

<ZeroQueryWrapper
  query={page.data.z.query.areas
    .where('id', Number(page.params.id))
    .related('parent', (q) => q.related('parent', (q) => q.related('parent')))
    .one()}
>
  {#snippet children(area)}
    {@const { pathname } = area == null ? {} : areaWithPathname(area)}
    {#if pathname == null}
      <Error status={404} />
    {:else}
      {#await goto(pathname, { replaceState: true })}
        <div class="flex justify-center">
          <ProgressRing size="size-12" value={null} />
        </div>
      {/await}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
