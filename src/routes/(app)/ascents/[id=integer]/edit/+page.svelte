<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { ascentWithPathname } from '$lib/db/utils.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
</script>

<ZeroQueryWrapper
  query={page.data.z.query.ascents
    .where('id', Number(page.params.id))
    .related('route', (q) =>
      q.related('block', (q) =>
        q.related('area', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
      ),
    )
    .one()}
>
  {#snippet children(ascent)}
    {@const { pathname } = (ascent == null ? undefined : ascentWithPathname(ascent)) ?? {}}
    {#if pathname == null}
      <Error status={404} />
    {:else}
      {#await goto(pathname + '/edit', { replaceState: true })}
        <div class="flex justify-center">
          <ProgressRing size="size-12" value={null} />
        </div>
      {/await}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
