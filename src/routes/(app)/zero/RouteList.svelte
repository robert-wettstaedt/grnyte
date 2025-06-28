<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import RouteName from '$lib/components/RouteName'
  import RoutesFilter from '$lib/components/RoutesFilter'
  import { load as routesFilterLoad } from '$lib/components/RoutesFilter/handle.svelte'
  import { enrichRoute } from '$lib/db/utils.svelte'

  interface Props {
    onLoad: () => void
  }
  const { onLoad }: Props = $props()

  const data = $derived(routesFilterLoad())

  const enrichedRoutes = $derived(data.current.map((route) => ({ ...enrichRoute(route), ascents: route.ascents })))

  $effect(() => {
    if (data.details.type === 'complete') {
      onLoad()
    }
  })
</script>

<div class="mt-8">
  <RoutesFilter />
</div>

<div class="mt-8">
  {#if data.current.length === 0 && data.details.type !== 'complete'}
    <nav class="list-nav">
      <ul class="overflow-auto">
        {#each Array(10) as _}
          <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
        {/each}
      </ul>
    </nav>
  {:else}
    <GenericList items={enrichedRoutes}>
      {#snippet left(item)}
        <div class="flex gap-2">
          <Image path="/blocks/{item.block.id}/preview-image" size={64} />

          <div class="flex flex-col gap-1">
            <p class="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-white opacity-50">
              {item.block.area.name} / {item.block.name}
            </p>

            <RouteName route={item} />
          </div>
        </div>
      {/snippet}
    </GenericList>

    <div class="my-8 flex justify-center">
      <button
        class="btn preset-filled-primary-500"
        onclick={() => {
          const url = new URL(page.url)
          url.searchParams.set('pageSize', String(data.current.length + 15))
          goto(url, { noScroll: true, replaceState: true })
        }}
      >
        Load more
      </button>
    </div>
  {/if}
</div>
