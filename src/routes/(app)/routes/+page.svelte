<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import RouteName from '$lib/components/RouteName'
  import RoutesFilter from '$lib/components/RoutesFilter'
  import { Pagination } from '@skeletonlabs/skeleton-svelte'

  let { data } = $props()
</script>

<svelte:head>
  <title>Routes - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Routes
  {/snippet}
</AppBar>

<div class="mt-8">
  <RoutesFilter />
</div>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  <GenericList items={data.routes}>
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
</div>

<div class="my-8 flex justify-center">
  <Pagination
    buttonClasses="btn-sm md:btn-md px-3"
    count={data.pagination.total}
    data={[]}
    page={data.pagination.page}
    pageSize={data.pagination.pageSize}
    siblingCount={0}
    onPageChange={(detail) => {
      const url = new URL(page.url)
      url.searchParams.set('page', String(detail.page))
      goto(url)
    }}
  />
</div>
