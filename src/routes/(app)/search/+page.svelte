<script lang="ts">
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import RouteName from '$lib/components/RouteName'
  import type { SearchResults } from '$lib/search.server'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  let { data } = $props()

  let searchQuery = $state(page.url.searchParams.get('q') ?? '')
  let element: HTMLInputElement | null = $state(null)

  let tabValue: string | undefined = $state(undefined)
  afterNavigate(() => {
    const item = ['routes', 'blocks', 'areas', 'users'].find((item) => {
      const results = data.searchResults?.[item as keyof SearchResults]
      return results != null && results.length > 0
    })

    tabValue = item == null ? undefined : `#${item}`
  })

  onMount(() => {
    element?.focus()
  })
</script>

<svelte:head>
  <title>Search - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Search
  {/snippet}
</AppBar>

<form class="mt-8">
  <label class="label">
    <input
      bind:this={element}
      bind:value={searchQuery}
      class="input"
      name="q"
      onkeypress={(event) => event.key === 'Enter' && (element as HTMLFormElement | null)?.submit?.()}
      placeholder="Search..."
      type="search"
    />
  </label>
</form>

{#if data.searchResults == null}
  {#if data.recentSearch != null && data.recentSearch.length > 0}
    <div class="card mt-8 p-2 md:p-4 preset-filled-surface-100-900 flex flex-col">
      <div class="text-center text-sm text-surface-500-900 mb-2">
        <i class="fa-solid fa-clock-rotate-left"></i>
        Recent searches
      </div>

      {#each data.recentSearch as item}
        <a class="anchor py-2" href={`/search?q=${item}`}>
          {item}
        </a>
      {/each}
    </div>
  {/if}
{:else}
  <div class="card mt-8 p-2 md:p-4 preset-filled-surface-100-900">
    {#if tabValue == null}
      <div class="text-center text-sm text-surface-500-900">No results found</div>
    {:else}
      <Tabs fluid listClasses="overflow-x-auto overflow-y-hidden pb-[1px] md:w-[500px]" listGap="0" value={tabValue}>
        {#snippet list()}
          {#if data.searchResults.routes.length > 0}
            <Tabs.Control value="#routes">
              Routes ({data.searchResults.routes.length})
            </Tabs.Control>
          {/if}

          {#if data.searchResults.blocks.length > 0}
            <Tabs.Control value="#blocks">
              Blocks ({data.searchResults.blocks.length})
            </Tabs.Control>
          {/if}

          {#if data.searchResults.areas.length > 0}
            <Tabs.Control value="#areas">
              Areas ({data.searchResults.areas.length})
            </Tabs.Control>
          {/if}

          {#if data.searchResults.users.length > 0}
            <Tabs.Control value="#users">
              Users ({data.searchResults.users.length})
            </Tabs.Control>
          {/if}
        {/snippet}

        {#snippet content()}
          <Tabs.Panel value="#routes">
            <GenericList items={data.searchResults.routes}>
              {#snippet left(item)}
                <div class="flex gap-2">
                  <Image path="/blocks/{item.block.id}/preview-image" size={64} />

                  <div class="flex flex-col gap-1">
                    <p class="text-xs opacity-50 overflow-hidden text-ellipsis whitespace-nowrap text-white">
                      {item.block.area.name} / {item.block.name}
                    </p>

                    <RouteName route={item} />
                  </div>
                </div>
              {/snippet}
            </GenericList>
          </Tabs.Panel>

          <Tabs.Panel value="#blocks">
            <GenericList items={data.searchResults.blocks}>
              {#snippet left(item)}
                <div class="flex items-center gap-2">
                  <Image path="/blocks/{item.id}/preview-image" size={64} />

                  {item.name}
                </div>
              {/snippet}
            </GenericList>
          </Tabs.Panel>

          <Tabs.Panel value="#areas">
            <GenericList items={data.searchResults.areas}>
              {#snippet left(item)}
                {item.name}
              {/snippet}
            </GenericList>
          </Tabs.Panel>

          <Tabs.Panel value="#users">
            <GenericList
              items={data.searchResults.users.map((user) => ({
                ...user,
                name: user.username,
                pathname: `/users/${user.username}`,
              }))}
            >
              {#snippet left(item)}
                {item.name}
              {/snippet}
            </GenericList>
          </Tabs.Panel>
        {/snippet}
      </Tabs>
    {/if}
  </div>
{/if}
