<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import GenericList from '$lib/components/GenericList'
  import GradeHistogram from '$lib/components/GradeHistogram'
  import Image from '$lib/components/Image'
  import RouteName from '$lib/components/RouteName'
  import RoutesFilter from '$lib/components/RoutesFilter'
  import { AppBar, Pagination, Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  let { data } = $props()

  let tabValue: string | undefined = $state(undefined)
  afterNavigate(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : '#areas'
  })
  onMount(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : '#areas'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.hash = event.value
    goto(newUrl.toString(), { replaceState: true })
  }
</script>

<svelte:head>
  <title>Areas - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet headline()}
    <Tabs
      fluid
      listClasses="overflow-x-auto overflow-y-hidden pb-[1px] md:w-[500px]"
      listGap="0"
      onValueChange={onChangeTab}
      value={tabValue}
    >
      {#snippet list()}
        <Tabs.Control value="#areas">Areas</Tabs.Control>
        <Tabs.Control value="#routes">Routes</Tabs.Control>
      {/snippet}

      {#snippet content()}
        <Tabs.Panel value="#areas">
          {#if data.areas.length === 0}
            No areas yet
          {:else}
            <GenericList
              items={data.areas.map((item) => ({ ...item, pathname: `/areas/${item.slug}-${item.id}` }))}
              listClasses="border-b-[1px] border-surface-700 last:border-none py-2"
              wrap={false}
            >
              {#snippet left(item)}
                {item.name}

                {#if data.userRegions.length > 1}
                  <div class="text-surface-400 text-xs">
                    {data.userRegions.find((region) => region.regionFk === item.regionFk)?.name ?? ''}
                  </div>
                {/if}
              {/snippet}

              {#snippet right(item)}
                <div class="flex flex-col">
                  <GradeHistogram
                    axes={false}
                    data={item.grades ?? []}
                    spec={{
                      width: 100,
                    }}
                    opts={{
                      height: 38,
                    }}
                  />

                  <div class="flex items-center justify-end text-sm opacity-70">
                    {item.numOfRoutes}

                    {#if item.numOfRoutes === 1}
                      route
                    {:else}
                      routes
                    {/if}
                  </div>
                </div>
              {/snippet}
            </GenericList>
          {/if}
        </Tabs.Panel>

        <Tabs.Panel value="#routes">
          <div class="mt-8">
            <RoutesFilter />
          </div>

          <div class="mt-8">
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
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  {/snippet}
</AppBar>
