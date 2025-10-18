<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import type { Row } from '$lib/db/zero'
  import type { RouteNameProps } from '.'
  import RouteName from './RouteName.svelte'

  interface Props extends Omit<RouteNameProps, 'route'> {
    route: Row<'routes'>
  }

  let { route, ...rest }: Props = $props()

  const query = $derived(page.data.z.query.ascents.where('routeFk', route.id!).where('createdBy', pageState.user!.id!))
  // svelte-ignore state_referenced_locally
  const ascentsResult = page.data.z.createQuery(query)
  $effect(() => ascentsResult.updateQuery(query))

  const data = $derived({ ...route, ascents: ascentsResult.data } satisfies RouteNameProps['route'])
</script>

<RouteName {...rest} route={data} />
