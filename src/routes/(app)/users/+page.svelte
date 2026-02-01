<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import GenericList from '$lib/components/GenericList'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { appRoleLabels } from '$lib/db/schema'
  import { getI18n } from '$lib/i18n'
  import { AppBar, Pagination } from '@skeletonlabs/skeleton-svelte'

  const { data } = $props()

  const { t } = $derived(getI18n())
</script>

<svelte:head>
  <title>{t('users.title')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('users.title')}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  <div class="table-wrap">
    {#if data.users.length === 0}
      {t('users.noUsersYet')}
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
    count={data.pagination.total}
    page={data.pagination.page}
    pageSize={data.pagination.pageSize}
    siblingCount={0}
    onPageChange={(detail) => {
      const url = new URL(page.url)
      url.searchParams.set('page', String(detail.page))
      goto(url)
    }}
  >
    <Pagination.PrevTrigger>
      <i class="fa-solid fa-arrow-left"></i>
    </Pagination.PrevTrigger>

    <Pagination.Context>
      {#snippet children(pagination)}
        {#each pagination().pages as page, index (page)}
          {#if page.type === 'page'}
            <Pagination.Item {...page}>
              {page.value}
            </Pagination.Item>
          {:else}
            <Pagination.Ellipsis {index}>&#8230;</Pagination.Ellipsis>
          {/if}
        {/each}
      {/snippet}
    </Pagination.Context>

    <Pagination.NextTrigger>
      <i class="fa-solid fa-arrow-right"></i>
    </Pagination.NextTrigger>
  </Pagination>
</div>
