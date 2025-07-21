import type { RowWithRelations, Schema } from '$lib/db/zero'
import type { PullRow } from '@rocicorp/zero'

export * from './ActivityFeed.svelte'
export { default } from './ActivityFeed.svelte'
export { default as ActivityFeedLoader } from './ActivityFeedLoader.svelte'

export interface BaseEntity {
  breadcrumb?: string[]
}

export interface AreaEntity extends BaseEntity {
  type: 'area'
  object?: PullRow<'areas', Schema> | null
}

export interface BlockEntity extends BaseEntity {
  type: 'block'
  object?: PullRow<'block', Schema> | null
}

export interface RouteEntity extends BaseEntity {
  type: 'route'
  object?: PullRow<'route', Schema> | null
}

export interface AscentEntity extends BaseEntity {
  type: 'ascent'
  object?: RowWithRelations<'ascents', Schema, { author: true; files: true }> | null
}

export interface FileEntity extends BaseEntity {
  type: 'file'
  object?: PullRow<'file', Schema> | null
}

export interface UserEntity extends BaseEntity {
  type: 'user'
  object?: PullRow<'user', Schema> | null
}

export type Entity = AreaEntity | BlockEntity | RouteEntity | AscentEntity | FileEntity | UserEntity

export interface ActivityWithDate extends PullRow<'activities', Schema> {
  createdAtDate: Date
}

export interface ActivityGroup {
  date: Date
  files: RowWithRelations<'files', Schema, { ascent: true }>[]
  items: ActivityWithDate[]
  userFk: number
}

export interface ActivityDTO extends RowWithRelations<'activities', Schema, { user: true }> {
  entityName?: string | null
  entity: Entity

  parentEntityName?: string | null
  parentEntity?: Entity

  region: PullRow<'regions', Schema> | undefined
}
