<script lang="ts">
  import { page } from '$app/state'
  import AreaStats from '$lib/components/AreaStats'
  import GenericList from '$lib/components/GenericList'
  import ZeroQueryWrapper, { type ZeroQueryWrapperBaseProps } from '$lib/components/ZeroQueryWrapper'

  interface Props extends ZeroQueryWrapperBaseProps {
    parentFk?: number | null
  }
  const { parentFk, ...rest }: Props = $props()
</script>

<ZeroQueryWrapper
  {...rest}
  loadingIndicator={{ type: 'skeleton' }}
  query={page.data.z.current.query.areas.where('parentFk', 'IS', parentFk ?? null).orderBy('name', 'asc')}
>
  {#snippet children(areas)}
    <GenericList
      items={areas.map((item) => ({
        ...item,
        id: item.id!,
        pathname: `${page.url.pathname}/${item.slug}-${item.id}`,
      }))}
      listClasses="border-b-[1px] border-surface-700 last:border-none py-2"
      wrap={false}
    >
      {#snippet left(item)}
        {item.name}

        {#if parentFk == null && page.data.userRegions.length > 1}
          <div class="text-surface-400 text-xs">
            {page.data.userRegions.find((region) => region.regionFk === item.regionFk)?.name ?? ''}
          </div>
        {/if}
      {/snippet}

      {#snippet right(item)}
        <div class="flex flex-col">
          <AreaStats
            areaId={item.id}
            axes={false}
            spec={{
              width: 100,
            }}
            opts={{
              height: 38,
            }}
          >
            {#snippet children(routes)}
              <div class="flex items-center justify-end text-sm opacity-70">
                {routes.length}

                {#if routes.length === 1}
                  route
                {:else}
                  routes
                {/if}
              </div>
            {/snippet}
          </AreaStats>
        </div>
      {/snippet}
    </GenericList>
  {/snippet}
</ZeroQueryWrapper>
