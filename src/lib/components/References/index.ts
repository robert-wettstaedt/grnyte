import type { Row, RowWithRelations } from '$lib/db/zero'

export { default } from './References.svelte'
export { default as ReferencesLoader } from './Loader.svelte'

export interface References {
  areas: Row<'areas'>[]
  ascents: RowWithRelations<'ascents', { author: true; route: true }>[]
  routes: Row<'routes'>[]
}
