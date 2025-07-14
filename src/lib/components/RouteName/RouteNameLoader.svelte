<script lang="ts">
  import { page } from '$app/state'
  import type { Schema } from '$lib/db/zero'
  import type { PullRow } from '@rocicorp/zero'
  import { Query } from 'zero-svelte'
  import type { RouteNameProps } from '.'
  import RouteName from './RouteName.svelte'

  interface Props extends Omit<RouteNameProps, 'route'> {
    route: PullRow<'routes', Schema>
  }

  let { route, ...rest }: Props = $props()

  const { current: ascents } = $derived(
    new Query(page.data.z.current.query.ascents.where('routeFk', route.id!).where('createdBy', page.data.user?.id!)),
  )

  const data = $derived({ ...route, ascents } satisfies RouteNameProps['route'])
</script>

<RouteName {...rest} route={data} />
