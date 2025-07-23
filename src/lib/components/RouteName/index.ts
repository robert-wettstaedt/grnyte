import type { RowWithRelations } from '$lib/db/zero'

export { default } from './RouteName.svelte'
export { default as RouteNameLoader } from './RouteNameLoader.svelte'

export interface RouteNameProps {
  classes?: string
  route: RowWithRelations<'routes', { ascents: true }>
}
