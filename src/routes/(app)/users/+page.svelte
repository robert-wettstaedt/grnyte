<script lang="ts">
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { EDIT_PERMISSION } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import GenericList from '$lib/components/GenericList'
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
          {#if data.userPermissions?.includes(EDIT_PERMISSION)}
            {#if item.role}
              {item.role}
            {:else}
              <form method="POST" action="?/addRole" use:enhance>
                <input type="hidden" name="authUserFk" value={item.authUserFk} />
                <button class="btn preset-outlined" type="submit">Assign user role</button>
              </form>
            {/if}
          {/if}
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
