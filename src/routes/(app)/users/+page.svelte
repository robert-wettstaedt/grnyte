<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import GenericList from '$lib/components/GenericList'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { appRoleLabels } from '$lib/db/schema'
  import { Pagination } from '@skeletonlabs/skeleton-svelte'

  const { data } = $props()
</script>

<svelte:head>
  <title>Users - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Users
  {/snippet}
</AppBar>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  <div class="table-wrap">
    {#if data.users.length === 0}
      No users yet
    {:else}
      <GenericList
        items={data.users.map((item) => ({ ...item, name: item.username, pathname: `/users/${item.username}` }))}
        wrap={false}
      >
        {#snippet left(item)}
          {item.username}
        {/snippet}

        {#snippet right(item)}
          <div class="flex flex-col text-right">
            {#each item.regions as region}
              <span>
                {#if pageState.userRegions.length > 1}
                  {appRoleLabels[region.role]} ({region.name})
                {:else}
                  {appRoleLabels[region.role]}
                {/if}
              </span>
            {/each}
          </div>
        {/snippet}
      </GenericList>
    {/if}
  </div>
</div>

<div class="my-8 flex justify-end">
  <Pagination
    buttonClasses="btn-sm md:btn-md"
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
