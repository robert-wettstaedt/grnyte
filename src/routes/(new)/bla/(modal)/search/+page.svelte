<script lang="ts">
  import { page } from '$app/state'
  import { sheetState } from '$lib/components/BottomSheetPanel'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import { pageState } from '$lib/components/Layout'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import RouteName from '$lib/components/RouteName/RouteNameLoader.svelte'
  import type { Region } from '$lib/db/zero'
  import { queries } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'

  const { t } = getI18n()

  interface BaseItem {
    fields: string[]
    id: string
    name: string
    pathname: string
    region: Region | undefined
  }

  interface AreaItem extends BaseItem {
    data: (typeof areasResult.data)[0]
    type: 'area'
  }

  interface BlockItem extends BaseItem {
    data: (typeof blocksResult.data)[0]
    type: 'block'
  }

  interface RouteItem extends BaseItem {
    data: (typeof routesResult.data)[0]
    type: 'route'
  }

  interface UserItem extends BaseItem {
    data: (typeof usersResult.data)[0]
    type: 'user'
  }

  type SearchItem = AreaItem | BlockItem | RouteItem | UserItem

  let searchQuery = $derived(page.url.searchParams.get('q') ?? '')

  const { data: regions } = $derived(page.data.z.q(queries.regions()))

  const areasResult = $derived(page.data.z.q(queries.listAreas({ content: searchQuery })))

  const blocksResult = $derived(page.data.z.q(queries.listBlocks({ content: searchQuery })))

  const routesResult = $derived(page.data.z.q(queries.listRoutesWithRelations({ content: searchQuery })))

  const usersResult = $derived(page.data.z.q(queries.listUsers({ content: searchQuery })))

  const isLoading = $derived(
    (areasResult.data.length === 0 && areasResult.details.type !== 'complete') ||
      (blocksResult.data.length === 0 && blocksResult.details.type !== 'complete') ||
      (routesResult.data.length === 0 && routesResult.details.type !== 'complete') ||
      (usersResult.data.length === 0 && usersResult.details.type !== 'complete'),
  )

  const searchResults = $derived.by(() => {
    if (searchQuery.trim() === '') {
      return []
    }

    const items: SearchItem[] = [
      ...areasResult.data.map(
        (item): AreaItem => ({
          data: item,
          fields: [item.name, item.description].filter((s) => s != null),
          name: item.name,
          id: `/areas/${item.id}`,
          pathname: `/bla/areas/${item.id}`,
          region: undefined,
          type: 'area',
        }),
      ),
      ...blocksResult.data.map(
        (item): BlockItem => ({
          data: item,
          fields: [item.name],
          name: item.name,
          id: `/blocks/${item.id}`,
          pathname: `/bla/blocks/${item.id}`,
          region: undefined,
          type: 'block',
        }),
      ),
      ...routesResult.data.map(
        (item): RouteItem => ({
          data: item,
          fields: [item.name, item.description].filter((s) => s != null),
          name: item.name,
          id: `/routes/${item.id}`,
          pathname: `/bla/routes/${item.id}`,
          region: undefined,
          type: 'route',
        }),
      ),
      ...usersResult.data.map(
        (item): UserItem => ({
          data: item,
          fields: [item.username],
          name: item.username,
          id: `/users/${item.username}`,
          pathname: `/bla/users/${item.username}`,
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

  $effect(() => {
    sheetState.title = t('nav.search')
  })
</script>

{#if isLoading && searchResults.length === 0}
  <div class="card p-2 md:p-4">
    <nav class="list-nav">
      <ul class="overflow-auto">
        {#each Array(10) as _}
          <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
        {/each}
      </ul>
    </nav>
  </div>
{:else if searchResults.length === 0}
  <div class="card mt-4 p-2 md:p-4">
    {t('common.noResults')} <span class="text-primary-500">{searchQuery}</span>.
  </div>
{:else}
  {#if isLoading}
    <LoadingIndicator class="mt-8 flex items-center justify-center" size={12} />
  {/if}

  <div class="pt-4">
    <GenericList items={searchResults}>
      {#snippet left(item)}
        <div class="flex items-center gap-2">
          {#if item.type === 'area'}
            <i class="fa-solid fa-layer-group text-surface-contrast-200-800 min-w-16 text-[51px]"></i>
          {:else if item.type === 'block'}
            <Image path="/blocks/{item.data.id}/preview-image" size={64} />
          {:else if item.type === 'route'}
            <Image path="/blocks/{item.data.block?.id}/preview-image" size={64} />
          {:else if item.type === 'user'}
            <i class="fa-solid fa-circle-user text-surface-contrast-200-800 min-w-16 text-[51px]"></i>
          {/if}

          {#if item.type === 'user'}
            {item.name}
          {:else}
            <div class="flex flex-col gap-1 overflow-hidden">
              <p
                class="text-surface-contrast-200-800 overflow-hidden text-xs text-ellipsis whitespace-nowrap opacity-50"
              >
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
