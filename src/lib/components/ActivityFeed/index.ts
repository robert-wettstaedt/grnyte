import type { Row, RowWithRelations } from '$lib/db/zero'

export * from './ActivityFeed.svelte'
export { default } from './ActivityFeed.svelte'
export { default as ActivityFeedLoader } from './ActivityFeedLoader.svelte'

export interface BaseEntity {
  breadcrumb?: string[]
}

export interface AreaEntity extends BaseEntity {
  type: 'area'
  object?: Row<'areas'> | null
}

export interface BlockEntity extends BaseEntity {
  type: 'block'
  object?: Row<'blocks'> | null
}

export interface RouteEntity extends BaseEntity {
  type: 'route'
  object?: Row<'routes'> | null
}

export interface AscentEntity extends BaseEntity {
  type: 'ascent'
  object?: RowWithRelations<'ascents', { author: true; files: true }> | null
}

export interface FileEntity extends BaseEntity {
  type: 'file'
  object?: Row<'files'> | null
}

export interface UserEntity extends BaseEntity {
  type: 'user'
  object?: Row<'users'> | null
}

export type Entity = AreaEntity | BlockEntity | RouteEntity | AscentEntity | FileEntity | UserEntity

export interface ActivityWithDate extends Row<'activities'> {
  createdAtDate: Date
}

export interface ActivityGroup {
  date: Date
  files: RowWithRelations<'files', { ascent: true }>[]
  items: ActivityWithDate[]
  userFk: number
}

export interface ActivityDTO extends RowWithRelations<'activities', { user: true }> {
  entityName?: string | null
  entity: Entity

  parentEntityName?: string | null
  parentEntity?: Entity

  region: Row<'regions'> | undefined
}
