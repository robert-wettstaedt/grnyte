<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { focus } from '$lib/actions/focus.svelte'
  import AppBar from '$lib/components/AppBar'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { Region } from '$lib/db/zero'
  import { queries } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import debounce from 'lodash.debounce'
  import type { KeyboardEventHandler } from 'svelte/elements'
  import { Query } from 'zero-svelte'

  const KEY = `[${PUBLIC_APPLICATION_NAME}] recent-search`
  const MAX_RECENT_SEARCH = 7

  interface BaseItem {
    fields: string[]
    id: string
    name: string
    pathname: string
    region: Region | undefined
  }

  interface AreaItem extends BaseItem {
    data: (typeof areasResult.current)[0]
    type: 'area'
  }

  interface BlockItem extends BaseItem {
    data: (typeof blocksResult.current)[0]
    type: 'block'
  }

  interface RouteItem extends BaseItem {
    data: (typeof routesResult.current)[0]
    type: 'route'
  }

  interface UserItem extends BaseItem {
    data: (typeof usersResult.current)[0]
    type: 'user'
  }

  type SearchItem = AreaItem | BlockItem | RouteItem | UserItem

  let value = $state(page.url.searchParams.get('q') ?? '')
  let searchQuery = $derived(page.url.searchParams.get('q') ?? '')
  let recentSearch: string[] = $state(globalThis.localStorage.getItem(KEY)?.split(',') ?? [])

  $effect(() => {
    value = searchQuery
  })

  const { current: regions } = $derived(new Query(queries.regions(page.data)))

  const areasQuery = $derived(queries.listAreas(page.data, { content: searchQuery }))
  // svelte-ignore state_referenced_locally
  const areasResult = new Query(areasQuery)
  $effect(() => areasResult.updateQuery(areasQuery))

  const blocksQuery = $derived(queries.listBlocks(page.data, { content: searchQuery }))
  // svelte-ignore state_referenced_locally
  const blocksResult = new Query(blocksQuery)
  $effect(() => blocksResult.updateQuery(blocksQuery))

  const routesQuery = $derived(queries.listRoutesWithRelations(page.data, { content: searchQuery }))
  // svelte-ignore state_referenced_locally
  const routesResult = new Query(routesQuery)
  $effect(() => routesResult.updateQuery(routesQuery))

  const usersQuery = $derived(queries.listUsers(page.data, { content: searchQuery }))
  // svelte-ignore state_referenced_locally
  const usersResult = new Query(usersQuery)
  $effect(() => usersResult.updateQuery(usersQuery))

  const isLoading = $derived(
    (areasResult.current.length === 0 && areasResult.details.type !== 'complete') ||
      (blocksResult.current.length === 0 && blocksResult.details.type !== 'complete') ||
      (routesResult.current.length === 0 && routesResult.details.type !== 'complete') ||
      (usersResult.current.length === 0 && usersResult.details.type !== 'complete'),
  )

  const searchResults = $derived.by(() => {
    if (searchQuery.trim() === '') {
      return []
    }

    const items: SearchItem[] = [
      ...areasResult.current.map(
        (item): AreaItem => ({
          data: item,
          fields: [item.name, item.description].filter((s) => s != null),
          name: item.name,
          id: `/areas/${item.id}`,
          pathname: `/areas/${item.id}`,
          region: undefined,
          type: 'area',
        }),
      ),
      ...blocksResult.current.map(
        (item): BlockItem => ({
          data: item,
          fields: [item.name],
          name: item.name,
          id: `/blocks/${item.id}`,
          pathname: `/blocks/${item.id}`,
          region: undefined,
          type: 'block',
        }),
      ),
      ...routesResult.current.map(
        (item): RouteItem => ({
          data: item,
          fields: [item.name, item.description].filter((s) => s != null),
          name: item.name,
          id: `/routes/${item.id}`,
          pathname: `/routes/${item.id}`,
          region: undefined,
          type: 'route',
        }),
      ),
      ...usersResult.current.map(
        (item): UserItem => ({
          data: item,
          fields: [item.username],
          name: item.username,
          id: `/users/${item.username}`,
          pathname: `/users/${item.username}`,
          region: undefined,
          type: 'user',
        }),
      ),
    ]

    const withRegions = items.map((item) => {
      const regionFk = 'regionFk' in item.data ? item.data.regionFk : undefined

      if (regionFk == null) {
        return item
      }

      return {
        ...item,
        region: regions.find((region) => region.id === regionFk),
      }
    })

    const sorted = withRegions.toSorted((a, b) => {
      const indexA = Math.min(
        ...a.fields.map((field) => field.toLowerCase().indexOf(searchQuery.toLowerCase())).filter((i) => i >= 0),
      )
      const indexB = Math.min(
        ...b.fields.map((field) => field.toLowerCase().indexOf(searchQuery.toLowerCase())).filter((i) => i >= 0),
      )
      return indexA - indexB
    })

    const limited = sorted.reduce(
      (acc, item) => {
        if (acc.filter((i) => i.type === item.type).length >= 5) {
          return acc
        }

        return [...acc, item]
      },
      [] as typeof sorted,
    )

    return limited
  })

  const submitQuery = (query: string, name: string) => {
    const searchParams = new URLSearchParams(page.url.searchParams)
    if (query.length === 0) {
      searchParams.delete(name)
    } else {
      searchParams.set(name, query)

      recentSearch = recentSearch.filter((item) => item !== query)
      recentSearch.unshift(query)
      recentSearch = recentSearch.slice(0, MAX_RECENT_SEARCH)
      globalThis.localStorage.setItem(KEY, recentSearch.join(','))
    }

    const url = new URL(page.url)
    url.search = searchParams.toString()

    goto(url, { keepFocus: true, replaceState: true })
  }

  const onchange: KeyboardEventHandler<HTMLInputElement> = (event) => {
    const target = event.target as HTMLInputElement
    const query = target.value.trim()
    const name = target.name

    submitQuery(query, name)
  }
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
    <div class="input-group grid-cols-[1fr_auto]">
      <input
        bind:value
        class="ig-input"
        name="q"
        onkeyup={debounce(onchange, 1000)}
        placeholder="Search..."
        type="search"
        use:focus
      />

      {#if searchQuery.trim().length > 0}
        <button
          aria-label="Clear search"
          class="ig-btn preset-outlined-surface-200-800"
          onclick={() => submitQuery('', 'q')}
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      {/if}
    </div>
  </label>
</form>

{#if searchQuery.trim().length === 0}
  {#if recentSearch.length > 0}
    <div class="card preset-filled-surface-100-900 mt-8 flex flex-col p-2 md:p-4">
      <div class="text-surface-500-900 mb-2 text-center text-sm">
        <i class="fa-solid fa-clock-rotate-left"></i>
        Recent searches
      </div>

      {#each recentSearch as item}
        <a class="anchor py-2" href={`/search?q=${item}`}>
          {item}
        </a>
      {/each}
    </div>
  {/if}
{:else if isLoading && searchResults.length === 0}
  <div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
    <nav class="list-nav">
      <ul class="overflow-auto">
        {#each Array(10) as _}
          <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
        {/each}
      </ul>
    </nav>
  </div>
{:else if searchResults.length === 0}
  <div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
    No results found for <span class="text-primary-500">{searchQuery}</span>.
  </div>
{:else}
  {#if isLoading}
    <div class="mt-8 flex justify-center">
      <ProgressRing value={null} size="size-14" />
    </div>
  {/if}

  <div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
    <GenericList items={searchResults}>
      {#snippet left(item)}
        <div class="flex items-center gap-2">
          {#if item.type === 'area'}
            <i class="fa-solid fa-layer-group min-w-[64px] text-[51px] text-white"></i>
          {:else if item.type === 'block'}
            <Image path="/blocks/{item.data.id}/preview-image" size={64} />
          {:else if item.type === 'route'}
            <Image path="/blocks/{item.data.block?.id}/preview-image" size={64} />
          {:else if item.type === 'user'}
            <i class="fa-solid fa-circle-user min-w-[64px] text-[51px] text-white"></i>
          {/if}

          {#if item.type === 'user'}
            {item.name}
          {:else}
            <div class="flex flex-col gap-1 overflow-hidden">
              <p class="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-white opacity-50">
                {#if pageState.userRegions.length > 1 && item.region != null}
                  {item.region.name}

                  {#if item.type === 'area'}
                    {#if item.data.parent != null}
                      ·
                    {/if}
                  {:else}
                    ·
                  {/if}
                {/if}

                {#if item.type === 'area'}
                  {#if item.data.parent?.parent != null}
                    {item.data.parent.parent.name} /
                  {/if}
                  {#if item.data.parent != null}
                    {item.data.parent.name}
                  {/if}
                {:else if item.type === 'block'}
                  {#if item.data.area?.parent != null}
                    {item.data.area.parent.name} /
                  {/if}
                  {#if item.data.area != null}
                    {item.data.area.name}
                  {/if}
                {:else if item.type === 'route'}
                  {#if item.data.block?.area?.parent == null}
                    {#if item.data.block?.area != null}
                      {item.data.block.area.name} /
                    {/if}
                  {:else}
                    {item.data.block.area.parent.name} /
                  {/if}
                  {#if item.data.block != null}
                    {item.data.block.name}
                  {/if}
                {/if}
              </p>

              {#if item.type === 'route'}
                <RouteName route={item.data} />
              {:else}
                {item.name}
              {/if}

              {#if 'description' in item.data}
                <MarkdownRenderer className="short" encloseReferences="strong" markdown={item.data.description ?? ''} />
              {/if}
            </div>
          {/if}
        </div>
      {/snippet}
    </GenericList>
  </div>
{/if}
