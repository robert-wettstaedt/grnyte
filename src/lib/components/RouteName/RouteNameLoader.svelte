<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import { queries, type Row } from '$lib/db/zero'
  import { Query } from 'zero-svelte'
  import type { RouteNameProps } from '.'
  import RouteName from './RouteName.svelte'

  interface Props extends Omit<RouteNameProps, 'route'> {
    route: Row<'routes'>
  }

  let { route, ...rest }: Props = $props()

  const query = $derived(queries.listAscents(page.data.session, { routeId: route.id, createdBy: pageState.user?.id }))
  // svelte-ignore state_referenced_locally
  const ascentsResult = new Query(query)
  $effect(() => ascentsResult.updateQuery(query))

  const data = $derived({ ...route, ascents: ascentsResult.current } satisfies RouteNameProps['route'])
</script>

<RouteName {...rest} route={data} />
