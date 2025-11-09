<script lang="ts">
  import GenericList from '$lib/components/GenericList'
  import RouteListItem from '$lib/components/RouteListItem'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { routeWithPathname } from '$lib/db/utils.svelte'
  import { queries } from '$lib/db/zero'
  import { Accordion } from '@skeletonlabs/skeleton-svelte'
  import { DateTime } from 'luxon'

  interface Props {
    routes: ZeroQueryResult<ReturnType<typeof queries.listRoutesWithRelations>>
  }

  const props: Props = $props()

  let value = $state<string[]>([])

  const map = $derived.by(() => {
    const routes = props.routes
      .map((route) => routeWithPathname(route))
      .filter((route) => route != null)
      .map((route) => {
        let current = route?.block?.area
        while (current?.parent != null) {
          current = current.parent as any
        }
        return { ...route, area: current?.name }
      })
      .filter((route) => route.area != null)
      .map((route) => ({ ...route, id: route.id!, area: route.area! }))

    return Object.groupBy(routes, (item) => item.area)
  })

  $effect(() => {
    if (value.length === 0) {
      value = [Object.keys(map)[0]]
    }
  })
</script>

<Accordion {value} collapsible multiple onValueChange={(event) => (value = event.value)}>
  {#each Object.entries(map) as [areaName, routes], index}
    {#if routes != null && routes.length > 0}
      <Accordion.Item value={areaName} controlPadding="px-2 py-1" panelPadding="p-0">
        {#snippet control()}
          {areaName}
        {/snippet}

        {#snippet panel()}
          <GenericList items={routes}>
            {#snippet left(route)}
              {#if route.ascents.length > 0}
                <RouteListItem {route}>
                  {#snippet description()}
                    <div class="flex max-w-[250px] items-center justify-between">
                      <p class="text-xs text-white opacity-50">Sessions: {route.ascents.length}</p>

                      <p class="text-xs text-white opacity-50">·</p>

                      {#if route.ascents[0]?.dateTime != null}
                        <p class="text-xs text-white opacity-50">
                          Last: {DateTime.fromMillis(route.ascents[0].dateTime).toLocaleString(DateTime.DATE_FULL)}
                        </p>
                      {/if}
                    </div>
                  {/snippet}
                </RouteListItem>
              {:else}
                <RouteListItem {route} />
              {/if}
            {/snippet}
          </GenericList>
        {/snippet}
      </Accordion.Item>

      {#if index + 1 < Object.keys(map).length}
        <hr class="hr" />
      {/if}
    {/if}
  {/each}
</Accordion>
