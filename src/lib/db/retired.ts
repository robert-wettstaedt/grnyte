import { REGION_PERMISSION_DELETE, REGION_PERMISSION_READ } from '$lib/auth'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgPolicy as policy,
  pgTable as table,
  text,
  type AnyPgColumn as AnyColumn,
} from 'drizzle-orm/pg-core'
import { getAuthorizedInRegionPolicyConfig, getOwnRowPolicyConfig } from './policy'
import { baseFields, baseRegionFields, regions, users } from './schema'

// Tables drizzle-kit still owns but Zero must not sync, so `generate:zero` reads only `schema.ts`.
// Zero rejects a client naming a dropped table, so a table moves here one release before its drop.

export const activityType: ['created', 'updated', 'deleted', 'uploaded'] = ['created', 'updated', 'deleted', 'uploaded']
export const activityParentEntityType: ['block', 'route', 'area', 'ascent'] = ['block', 'route', 'area', 'ascent']

/** Replaced by `events` and `changes`; nothing reads it. Dropped in the release after this one. */
export const activities = table(
  'activities',
  {
    ...baseFields,
    ...baseRegionFields,

    columnName: text('column_name'),
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type', { enum: [...activityParentEntityType, 'file', 'user'] }).notNull(),
    metadata: text('metadata'),
    newValue: text('new_value'),
    oldValue: text('old_value'),
    parentEntityId: text('parent_entity_id'),
    parentEntityType: text('parent_entity_type', { enum: activityParentEntityType }),
    type: pgEnum('activity_type', activityType)('type').notNull(),
    userFk: integer('user_fk').references((): AnyColumn => users.id),
  },
  (table) => [
    index('activities_created_at_idx').on(table.createdAt),
    index('activities_entity_id_idx').on(table.entityId),
    index('activities_entity_type_idx').on(table.entityType),
    index('activities_parent_entity_id_idx').on(table.parentEntityId),
    index('activities_type_idx').on(table.type),
    index('activities_user_fk_idx').on(table.userFk),
    index('activities_region_fk_idx').on(table.regionFk),

    policy(
      `${REGION_PERMISSION_READ} can insert activities`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read activities`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_DELETE} can delete activities`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_DELETE, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can delete their own activities`,
      getOwnRowPolicyConfig('delete', REGION_PERMISSION_READ, table.userFk, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can update their own activities`,
      getOwnRowPolicyConfig('update', REGION_PERMISSION_READ, table.userFk, table.regionFk),
    ),
  ],
).enableRLS()

export type Activity = InferSelectModel<typeof activities>
export type InsertActivity = InferInsertModel<typeof activities>

export const activitiesRelations = relations(activities, ({ one }) => ({
  region: one(regions, { fields: [activities.regionFk], references: [regions.id] }),
  user: one(users, { fields: [activities.userFk], references: [users.id] }),
}))
