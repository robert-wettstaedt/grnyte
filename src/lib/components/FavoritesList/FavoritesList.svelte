<script lang="ts">
  import GenericList from '$lib/components/GenericList'
  import RouteListItem from '$lib/components/RouteListItem'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { routeWithPathname } from '$lib/db/utils.svelte'
  import { queries } from '$lib/db/zero'
  import { Accordion } from '@skeletonlabs/skeleton-svelte'
  import { DateTime } from 'luxon'
  import { slide } from 'svelte/transition'
  import { getI18n } from '$lib/i18n'

  interface Props {
    routes: ZeroQueryResult<ReturnType<typeof queries.listRoutesWithRelations>>
  }

  const props: Props = $props()
  const { t } = getI18n()

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

    const map = Object.groupBy(routes, (item) => item.area)

    Object.keys(map).map((key) => {
      map[key] = map[key]?.toSorted(
        (a, b) =>
          (a.userGradeFk ?? a.gradeFk ?? Number.MAX_SAFE_INTEGER) -
          (b.userGradeFk ?? b.gradeFk ?? Number.MAX_SAFE_INTEGER),
      )
    })

    return map
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
      <Accordion.Item value={areaName}>
        <h3>
          <Accordion.ItemTrigger class="flex items-center justify-between gap-2 font-bold">
            {areaName}
            <Accordion.ItemIndicator class="group px-2 py-1">
              <i class="fa-solid fa-chevron-down transition group-data-[state=open]:rotate-180"></i>
            </Accordion.ItemIndicator>
          </Accordion.ItemTrigger>
        </h3>

        <Accordion.ItemContent>
          {#snippet element(attributes)}
            {#if !attributes.hidden}
              <div {...attributes} transition:slide={{ duration: 150 }}>
                <GenericList items={routes}>
                  {#snippet left(route)}
                    {#if route.ascents.length > 0}
                      <RouteListItem {route} showPath>
                        {#snippet description()}
                          <div class="flex items-center gap-2">
                            <p class="text-xs text-white opacity-50">{t('ascents.sessions')}: {route.ascents.length}</p>

                            <p class="text-xs text-white opacity-50">·</p>

                            {#if route.ascents[0]?.dateTime != null}
                              <p class="text-xs text-white opacity-50">
                                {t('ascents.lastSession')}: {DateTime.fromMillis(
                                  route.ascents[0].dateTime,
                                ).toLocaleString(DateTime.DATE_FULL)}
                              </p>
                            {/if}
                          </div>
                        {/snippet}
                      </RouteListItem>
                    {:else}
                      <RouteListItem {route} showPath />
                    {/if}
                  {/snippet}
                </GenericList>
              </div>
            {/if}
          {/snippet}
        </Accordion.ItemContent>
      </Accordion.Item>

      {#if index + 1 < Object.keys(map).length}
        <hr class="hr" />
      {/if}
    {/if}
  {/each}
</Accordion>
