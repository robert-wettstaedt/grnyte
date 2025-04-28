import type { Area, Block, Route, User } from '$lib/db/schema'
import type { InferResultType } from '$lib/db/types'
import type { FileDTO } from '$lib/nextcloud'

export * from './ActivityFeed.svelte'
export { default } from './ActivityFeed.svelte'

export interface BaseEntity {
  breadcrumb?: string[]
}

export interface AreaEntity extends BaseEntity {
  type: 'area'
  object?: Area | null
}

export interface BlockEntity extends BaseEntity {
  type: 'block'
  object?: Block | null
}

export interface RouteEntity extends BaseEntity {
  type: 'route'
  object?: Route | null
}

export interface AscentEntity extends BaseEntity {
  type: 'ascent'
  object?: (InferResultType<'ascents', { author: true }> & { files: FileDTO[] }) | null
}

export interface FileEntity extends BaseEntity {
  type: 'file'
  object?: FileDTO | null
}

export interface UserEntity extends BaseEntity {
  type: 'user'
  object?: User | null
}

export type Entity = AreaEntity | BlockEntity | RouteEntity | AscentEntity | FileEntity | UserEntity

export interface ActivityGroup {
  items: ActivityDTO[]
  user: ActivityDTO['user']
  parentEntity: ActivityDTO['parentEntity']
  entity: ActivityDTO['entity']
  latestDate: Date
}

export interface ActivityDTO extends InferResultType<'activities', { user: true }> {
  entityName?: string | null
  entity: Entity

  parentEntityName?: string | null
  parentEntity?: Entity
}
