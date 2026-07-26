import {
  APP_PERMISSION_ADMIN,
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import type { RegionSettings } from '$lib/forms/schemas'
import { createId as createCuid2 } from '@paralleldrive/cuid2'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy as policy,
  primaryKey,
  real,
  serial,
  pgTable as table,
  text,
  timestamp,
  uuid,
  type AnyPgColumn as AnyColumn,
  type PgPolicyConfig,
} from 'drizzle-orm/pg-core'
import { authUsers, supabaseAuthAdminRole } from 'drizzle-orm/supabase'
import z from 'zod'
import {
  createBasicTablePolicies,
  getAuthorizedInRegionPolicyConfig,
  getAuthorizedPolicyConfig,
  getOwnActivityPolicyConfig,
  getOwnEntryPolicyConfig,
  getPolicyConfig,
} from './policy'

/**
 *
 *
 * === HELPERS ===
 *
 *
 */

const baseFields = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: serial('id').notNull().primaryKey(),
}

const baseContentFields = {
  createdBy: integer('created_by')
    .notNull()
    .references((): AnyColumn => users.id),
  name: text('name').notNull(),
}

/** Soft-deletion marker \u2014 when set, the row is considered deleted but kept for recovery. */
const softDeleteFields = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

const baseRegionFields = {
  regionFk: integer('region_fk')
    .notNull()
    .references((): AnyColumn => regions.id),
}

const READ_AUTH_ADMIN_POLICY_CONFIG: PgPolicyConfig = {
  as: 'permissive',
  for: 'select',
  to: supabaseAuthAdminRole,
  using: sql`true`,
}

/**
 *
 *
 * === GLOBALS ===
 *
 *
 */

export const appPermission = pgEnum('app_permission', [
  REGION_PERMISSION_READ,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_ADMIN,

  APP_PERMISSION_ADMIN,
])
export const appRole = pgEnum('app_role', ['app_admin', 'region_user', 'region_maintainer', 'region_admin'])

export const appRoleLabels: Record<(typeof appRole.enumValues)[number], string> = {
  app_admin: 'App Admin',
  region_admin: 'Admin',
  region_maintainer: 'Maintainer',
  region_user: 'User',
}

export const userRoles = table(
  'user_roles',
  {
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    id: baseFields.id,
    role: appRole().notNull(),
  },
  () => [
    policy('auth admins can read user_roles', READ_AUTH_ADMIN_POLICY_CONFIG),
    policy(`users can read own user_roles`, getOwnEntryPolicyConfig('select')),
  ],
).enableRLS()

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  rolePermission: one(rolePermissions, { fields: [userRoles.role], references: [rolePermissions.role] }),
}))

export const rolePermissions = table(
  'role_permissions',
  {
    id: baseFields.id,
    permission: appPermission().notNull(),
    role: appRole().notNull(),
  },
  () => [policy('authenticated users can read role_permissions', getPolicyConfig('select', sql`true`))],
)

export const rolePermissionsRelations = relations(rolePermissions, ({ many }) => ({
  regionMembers: many(regionMembers),
}))

export const users = table(
  'users',
  {
    ...baseFields,
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),

    firstAscensionistFk: integer('first_ascentionist_fk').references((): AnyColumn => firstAscensionists.id),
    username: text('username').notNull(),
    userSettingsFk: integer('user_settings_fk').references((): AnyColumn => userSettings.id),
  },
  (table) => [
    index('users_auth_user_fk_idx').on(table.authUserFk),
    index('users_first_ascentionist_fk_idx').on(table.firstAscensionistFk),
    index('users_username_idx').on(table.username),

    policy('authenticated users can read users', getPolicyConfig('select', sql`true`)),
    policy('users can update own users', getOwnEntryPolicyConfig('update')),
  ],
).enableRLS()
export type InsertUser = InferInsertModel<typeof users>
export type User = InferSelectModel<typeof users>

export const usersRelations = relations(users, ({ many, one }) => ({
  areas: many(areas),
  ascents: many(ascents),
  authUser: one(authUsers, { fields: [users.authUserFk], references: [authUsers.id] }),

  blocks: many(blocks),
  favorites: many(favorites),
  firstAscensionist: one(firstAscensionists, {
    fields: [users.firstAscensionistFk],
    references: [firstAscensionists.id],
  }),
  pushSubscriptions: many(pushSubscriptions),
  regionMemberships: many(regionMembers, { relationName: 'region-member-user' }),
  routes: many(routes),
  userSettings: one(userSettings, { fields: [users.userSettingsFk], references: [userSettings.id] }),
}))

export const userSettings = table(
  'user_settings',
  {
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),

    cookie8a: text('cookie_8a'),
    cookie27crags: text('cookie_27crags'),

    cookieTheCrag: text('cookie_the_crag'),
    gradingScale: text('grading_scale', { enum: ['FB', 'V'] })
      .notNull()
      .default('FB'),
    id: baseFields.id,

    notifyModerations: boolean('notify_moderations').notNull().default(false),

    notifyNewAscents: boolean('notify_new_ascents').notNull().default(false),
    notifyNewUsers: boolean('notify_new_users').notNull().default(false),
    // null = follow the runtime locale (see isImperialLocale); set = explicit override.
    unitSystem: text('unit_system', { enum: ['metric', 'imperial'] }),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('user_settings_auth_user_fk_idx').on(table.authUserFk),
    index('user_settings_user_fk_idx').on(table.userFk),

    policy(`users can insert own users_settings`, getOwnEntryPolicyConfig('insert')),
    policy(`users can read own users_settings`, getOwnEntryPolicyConfig('select')),
    policy(`users can update own users_settings`, getOwnEntryPolicyConfig('update')),
  ],
).enableRLS()
export type InsertUserSettings = InferInsertModel<typeof userSettings>
export type UserSettings = InferSelectModel<typeof userSettings>

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  authUser: one(authUsers, { fields: [userSettings.authUserFk], references: [authUsers.id] }),
  user: one(users, { fields: [userSettings.userFk], references: [users.id] }),
}))

export const pushSubscriptions = table(
  'push_subscriptions',
  {
    auth: text('auth').notNull(),

    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    endpoint: text('endpoint').notNull(),

    expirationTime: integer('expiration_time'),
    id: baseFields.id,
    lang: text('lang'),
    p256dh: text('p256dh').notNull(),

    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('push_subscriptions_auth_user_fk_idx').on(table.authUserFk),
    index('push_subscriptions_user_fk_idx').on(table.userFk),

    policy(`users can delete own push_subscriptions`, getOwnEntryPolicyConfig('delete')),
    policy(`users can insert own push_subscriptions`, getOwnEntryPolicyConfig('insert')),
    policy(`users can read own push_subscriptions`, getOwnEntryPolicyConfig('select')),
    policy(`users can update own push_subscriptions`, getOwnEntryPolicyConfig('update')),
  ],
).enableRLS()

export type InsertPushSubscription = InferInsertModel<typeof pushSubscriptions>
export type PushSubscription = InferSelectModel<typeof pushSubscriptions>

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  authUser: one(authUsers, { fields: [pushSubscriptions.authUserFk], references: [authUsers.id] }),
  user: one(users, { fields: [pushSubscriptions.userFk], references: [users.id] }),
}))

export const regions = table(
  'regions',
  {
    ...baseFields,
    createdBy: baseContentFields.createdBy,
    maxMembers: integer('max_members').notNull().default(10),
    name: baseContentFields.name,
    settings: jsonb('settings').$type<RegionSettings>(),
  },
  (table) => [
    index('regions_name_idx').on(table.name),

    policy('authenticated users can create regions', getPolicyConfig('insert', sql`true`)),
    policy(`${APP_PERMISSION_ADMIN} can fully access regions`, getAuthorizedPolicyConfig('all', APP_PERMISSION_ADMIN)),
    policy(
      `users can read regions they are members of`,
      getPolicyConfig(
        'select',
        sql`
          EXISTS (
            SELECT
              1
            FROM
              region_members as rm
            WHERE
              rm.region_fk = regions.id
              AND rm.auth_user_fk = (SELECT auth.uid())
              AND rm.is_active = true
          )
        `,
      ),
    ),
    // `regions.id` rather than the helper's default `region_fk`: this table does not have one,
    // it is the region. Deleting stays app.admin-only via the policy above - a region delete
    // cascades through every piece of content in it.
    policy(
      `${REGION_PERMISSION_ADMIN} can update regions they administer`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_ADMIN, 'regions.id'),
    ),
  ],
).enableRLS()
export type InsertRegion = InferInsertModel<typeof regions>
export type Region = InferSelectModel<typeof regions>

export const regionsRelations = relations(regions, ({ many, one }) => ({
  author: one(users, { fields: [regions.createdBy], references: [users.id] }),
  members: many(regionMembers),
}))

export const regionMembers = table(
  'region_members',
  {
    ...baseFields,
    ...baseRegionFields,
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    invitedByFk: integer('invited_by').references((): AnyColumn => users.id),

    isActive: boolean('is_active').notNull().default(true),
    role: appRole().notNull(),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('region_members_auth_user_fk_idx').on(table.authUserFk),
    index('region_members_region_fk_idx').on(table.regionFk),
    index('region_members_user_fk_idx').on(table.userFk),
    index('region_members_region_auth_user_idx').on(table.regionFk, table.authUserFk),

    policy(
      `${APP_PERMISSION_ADMIN} can fully access region_members`,
      getAuthorizedPolicyConfig('all', APP_PERMISSION_ADMIN),
    ),
    policy(
      `${REGION_PERMISSION_ADMIN} can manage region_members`,
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_ADMIN),
    ),
    // Scoped to the reader's own regions, not `true`: this table is what tenancy is made of, and a
    // blanket read let any signed-in user enumerate every region's membership - who is in it, their
    // role and their auth uid - including regions whose `regions` row they cannot see.
    policy(
      `${REGION_PERMISSION_READ} can read region_members`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    // No own-row insert or update: either one lets any authenticated user join an arbitrary region
    // as region_admin, or promote themselves once in. The invite-accept flow needs its own insert
    // policy keyed on a matching region_invitations row.
    // Deleting your own row stays open, so leaving a region does not need an admin.
    policy('users can delete own region_members', getOwnEntryPolicyConfig('delete')),
  ],
).enableRLS()
export type InsertRegionMember = InferInsertModel<typeof regionMembers>
export type RegionMember = InferSelectModel<typeof regionMembers>

export const regionMembersRelations = relations(regionMembers, ({ one }) => ({
  authUser: one(authUsers, { fields: [regionMembers.authUserFk], references: [authUsers.id] }),
  invitedBy: one(users, { fields: [regionMembers.invitedByFk], references: [users.id] }),
  region: one(regions, { fields: [regionMembers.regionFk], references: [regions.id] }),
  rolePermission: one(rolePermissions, { fields: [regionMembers.role], references: [rolePermissions.role] }),
  // region_members has two FKs into users, so `users.regionMemberships` cannot pair itself - without
  // the relationName it silently binds to whichever drizzle resolves first (it flipped to invited_by
  // once regions gained an author relation, which would have made user search match by inviter).
  user: one(users, { fields: [regionMembers.userFk], references: [users.id], relationName: 'region-member-user' }),
}))

export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'expired'])

export const regionInvitations = table(
  'region_invitations',
  {
    ...baseFields,
    ...baseRegionFields,
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByFk: integer('accepted_by').references((): AnyColumn => users.id),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    invitedByFk: integer('invited_by')
      .notNull()
      .references((): AnyColumn => users.id),
    status: invitationStatusEnum('status').notNull().default('pending'),
    token: uuid('token').notNull().unique(),
  },
  (table) => [
    index('region_invitations_token_idx').on(table.token),
    index('region_invitations_region_fk_idx').on(table.regionFk),
    index('region_invitations_email_idx').on(table.email),
    index('region_invitations_status_idx').on(table.status),

    policy(
      `${REGION_PERMISSION_ADMIN} can insert region_invitations`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_ADMIN),
    ),
    policy(
      `${REGION_PERMISSION_ADMIN} can update region_invitations`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_ADMIN),
    ),
    policy(
      `region members can read region_invitations`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    // An invitee is not a member yet, so membership alone would leave them unable to see or accept
    // the invitation addressed to them. Matched on the JWT email, so it covers only their own.
    policy(
      `users can read own region_invitations`,
      getPolicyConfig('select', sql.raw(`(SELECT auth.jwt() ->> 'email') = email`)),
    ),
    policy(
      `users can update own region_invitations`,
      getPolicyConfig('update', sql.raw(`(SELECT auth.jwt() ->> 'email') = email`)),
    ),
  ],
).enableRLS()

export const regionInvitationsRelations = relations(regionInvitations, ({ one }) => ({
  acceptedBy: one(users, { fields: [regionInvitations.acceptedByFk], references: [users.id] }),
  invitedBy: one(users, { fields: [regionInvitations.invitedByFk], references: [users.id] }),
  region: one(regions, { fields: [regionInvitations.regionFk], references: [regions.id] }),
}))

export const grades = table(
  'grades',
  {
    FB: text('FB'),

    id: baseFields.id,
    V: text('V'),
  },
  () => [policy('authenticated users can read grades', getPolicyConfig('select', sql`true`))],
).enableRLS()
export type Grade = InferSelectModel<typeof grades>
export type InsertGrade = InferInsertModel<typeof grades>

export const gradesRelations = relations(grades, ({ many }) => ({
  ascents: many(ascents),
  routes: many(routes),
}))

export const tags = table(
  'tags',
  {
    id: text('id').primaryKey(),
  },
  () => [
    policy(`${APP_PERMISSION_ADMIN} can fully access tags`, getAuthorizedPolicyConfig('all', APP_PERMISSION_ADMIN)),
    policy('authenticated users can read tags', getPolicyConfig('select', sql`true`)),
  ],
).enableRLS()
export type InsertTag = InferInsertModel<typeof tags>
export type Tag = InferSelectModel<typeof tags>

export const tagsRelations = relations(tags, ({ many }) => ({
  routes: many(routesToTags),
}))

/**
 *
 *
 * === REGION-BASED ===
 *
 *
 */

export const areaVisibilityEnum: ['public', 'private'] = ['public', 'private']
export const areaTypeEnum: ['area', 'crag'] = ['area', 'crag']
export const areas = table(
  'areas',
  {
    ...baseFields,
    ...baseContentFields,
    ...baseRegionFields,
    ...softDeleteFields,

    description: text('description'),
    geoPaths: jsonb('geo_paths').$type<string[]>(),
    parentFk: integer('parent_fk').references((): AnyColumn => areas.id),
    type: text('type', { enum: areaTypeEnum }),

    walkingPaths: text('walking_paths').array(),
  },
  (table) => [
    index('areas_description_idx').on(table.description),
    index('areas_region_fk_idx').on(table.regionFk),
    index('areas_deleted_at_idx').on(table.deletedAt),

    ...createBasicTablePolicies('areas'),
    policy(
      `${REGION_PERMISSION_EDIT} can delete areas`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),
    policy(
      `${REGION_PERMISSION_READ} can update areas`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()
export type Area = InferSelectModel<typeof areas>
export type InsertArea = InferInsertModel<typeof areas>

export const areasRelations = relations(areas, ({ many, one }) => ({
  areas: many(areas, { relationName: 'area-to-area' }),
  author: one(users, { fields: [areas.createdBy], references: [users.id] }),
  blocks: many(blocks),

  files: many(files),
  parent: one(areas, { fields: [areas.parentFk], references: [areas.id], relationName: 'area-to-area' }),
  parkingLocations: many(geolocations),
  region: one(regions, { fields: [areas.regionFk], references: [regions.id] }),
}))

export const blocks = table(
  'blocks',
  {
    ...baseFields,
    ...baseContentFields,
    ...baseRegionFields,
    ...softDeleteFields,

    areaFk: integer('area_fk')
      .notNull()
      .references((): AnyColumn => areas.id),

    geolocationFk: integer('geolocation_fk').references((): AnyColumn => geolocations.id),
    order: integer('order').notNull(),
  },
  (table) => [
    index('blocks_region_fk_idx').on(table.regionFk),
    index('blocks_deleted_at_idx').on(table.deletedAt),
    index('blocks_geolocation_fk_idx').on(table.geolocationFk),

    ...createBasicTablePolicies('blocks'),
    policy(
      `${REGION_PERMISSION_EDIT} can delete blocks`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),
    policy(
      `${REGION_PERMISSION_READ} can update blocks`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()
export type Block = InferSelectModel<typeof blocks>
export type InsertBlock = InferInsertModel<typeof blocks>

export const blocksRelations = relations(blocks, ({ many, one }) => ({
  area: one(areas, { fields: [blocks.areaFk], references: [areas.id] }),
  author: one(users, { fields: [blocks.createdBy], references: [users.id] }),
  files: many(files),
  geolocation: one(geolocations, { fields: [blocks.geolocationFk], references: [geolocations.id] }),

  region: one(regions, { fields: [blocks.regionFk], references: [regions.id] }),
  routes: many(routes),
  topos: many(topos),
}))

export const routes = table(
  'routes',
  {
    ...baseFields,
    ...baseContentFields,
    ...baseRegionFields,
    ...softDeleteFields,

    areaFks: integer('area_fks').array(),
    areaIds: text('area_ids'),
    blockFk: integer('block_fk')
      .notNull()
      .references((): AnyColumn => blocks.id),
    description: text('description'),

    externalResourcesFk: integer('external_resources_fk').references((): AnyColumn => routeExternalResources.id),
    firstAscentYear: integer('first_ascent_year'),
    gradeFk: integer('grade_fk').references((): AnyColumn => grades.id),
    rating: integer('rating'),
    userGradeFk: integer('user_grade_fk').references((): AnyColumn => grades.id),
    userRating: integer('user_rating'),
  },
  (table) => [
    index('routes_block_fk_idx').on(table.blockFk),
    index('routes_description_idx').on(table.description),
    index('routes_region_fk_idx').on(table.regionFk),
    index('routes_deleted_at_idx').on(table.deletedAt),
    index('routes_area_fks_gin_idx').using('gin', table.areaFks),
    index('routes_area_ids_idx').on(table.areaIds),
    index('routes_grade_fk_idx').on(table.gradeFk),
    index('routes_user_grade_fk_idx').on(table.userGradeFk),
    index('routes_rating_idx').on(table.rating),
    index('routes_first_ascent_year_idx').on(table.firstAscentYear),
    index('routes_created_by_idx').on(table.createdBy),

    ...createBasicTablePolicies('routes'),
    policy(
      `${REGION_PERMISSION_EDIT} can delete routes`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),
    policy(
      `${REGION_PERMISSION_READ} can update routes`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()
export type InsertRoute = InferInsertModel<typeof routes>
export type Route = InferSelectModel<typeof routes>

export const routesRelations = relations(routes, ({ many, one }) => ({
  ascents: many(ascents),
  author: one(users, { fields: [routes.createdBy], references: [users.id] }),
  block: one(blocks, { fields: [routes.blockFk], references: [blocks.id] }),
  externalResources: one(routeExternalResources, {
    fields: [routes.externalResourcesFk],
    references: [routeExternalResources.id],
  }),
  files: many(files),

  firstAscents: many(routesToFirstAscensionists),
  grade: one(grades, { fields: [routes.gradeFk], references: [grades.id] }),
  region: one(regions, { fields: [routes.regionFk], references: [regions.id] }),
  tags: many(routesToTags),
  topoRoutes: many(topoRoutes),
}))

export const routeExternalResources = table(
  'route_external_resources',
  {
    id: baseFields.id,
    ...baseRegionFields,

    externalResource8aFk: integer('external_resource_8a_fk').references((): AnyColumn => routeExternalResource8a.id),

    externalResource27cragsFk: integer('external_resource_27crags_fk').references(
      (): AnyColumn => routeExternalResource27crags.id,
    ),
    externalResourceTheCragFk: integer('external_resource_the_crag_fk').references(
      (): AnyColumn => routeExternalResourceTheCrag.id,
    ),
    routeFk: integer('route_fk')
      .notNull()
      .references((): AnyColumn => routes.id),
  },

  (table) => [
    index('route_external_resources_route_fk_idx').on(table.routeFk),
    index('route_external_resources_region_fk_idx').on(table.regionFk),

    ...createBasicTablePolicies('route_external_resources'),
  ],
).enableRLS()
export type InsertRouteExternalResource = InferInsertModel<typeof routeExternalResources>
export type RouteExternalResource = InferSelectModel<typeof routeExternalResources>

export const routeExternalResourcesRelations = relations(routeExternalResources, ({ one }) => ({
  externalResource8a: one(routeExternalResource8a, {
    fields: [routeExternalResources.externalResource8aFk],
    references: [routeExternalResource8a.id],
  }),
  externalResource27crags: one(routeExternalResource27crags, {
    fields: [routeExternalResources.externalResource27cragsFk],
    references: [routeExternalResource27crags.id],
  }),
  externalResourceTheCrag: one(routeExternalResourceTheCrag, {
    fields: [routeExternalResources.externalResourceTheCragFk],
    references: [routeExternalResourceTheCrag.id],
  }),
  region: one(regions, { fields: [routeExternalResources.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [routeExternalResources.routeFk], references: [routes.id] }),
}))

export const routeExternalResource8a = table(
  'route_external_resource_8a',
  {
    id: baseFields.id,
    ...baseRegionFields,
    areaName: text('area_name'),
    areaSlug: text('area_slug'),
    averageRating: real('average_rating'),
    category: integer('category'),
    countryName: text('country_name'),
    countrySlug: text('country_slug'),
    cragName: text('crag_name'),
    cragSlug: text('crag_slug'),
    difficulty: text('difficulty'),
    externalResourcesFk: integer('external_resources_fk')
      .notNull()
      .references((): AnyColumn => routeExternalResources.id),
    gradeIndex: integer('grade_index'),
    sectorName: text('sector_name'),
    sectorSlug: text('sector_slug'),
    type: integer('type'),
    url: text('url'),
    zlaggableId: integer('zlaggable_id'),

    zlaggableName: text('zlaggable_name'),

    zlaggableSlug: text('zlaggable_slug'),
  },
  () => createBasicTablePolicies('route_external_resource_8a'),
).enableRLS()
export type InsertRouteExternalResource8a = InferInsertModel<typeof routeExternalResource8a>
export type RouteExternalResource8a = InferSelectModel<typeof routeExternalResource8a>

export const routeExternalResource8aRelations = relations(routeExternalResource8a, ({ one }) => ({
  externalResources: one(routeExternalResources, {
    fields: [routeExternalResource8a.externalResourcesFk],
    references: [routeExternalResources.id],
  }),
  region: one(regions, { fields: [routeExternalResource8a.regionFk], references: [regions.id] }),
}))

export const routeExternalResource27crags = table(
  'route_external_resource_27crags',
  {
    id: baseFields.id,
    ...baseRegionFields,

    country_name: text('country_name'),
    crag_id: integer('crag_id'),
    description: text('description'),
    externalResourcesFk: integer('external_resources_fk')
      .notNull()
      .references((): AnyColumn => routeExternalResources.id),
    latitude: real('latitude'),
    location_name: text('location_name'),
    longitude: real('longitude'),
    name: text('name'),
    path: text('path'),
    searchable_id: integer('searchable_id'),

    searchable_type: text('searchable_type'),

    url: text('url'),
  },
  () => createBasicTablePolicies('route_external_resource_27crags'),
).enableRLS()
export type InsertRouteExternalResource27crags = InferInsertModel<typeof routeExternalResource27crags>
export type RouteExternalResource27crags = InferSelectModel<typeof routeExternalResource27crags>

export const routeExternalResource27cragsRelations = relations(routeExternalResource27crags, ({ one }) => ({
  externalResources: one(routeExternalResources, {
    fields: [routeExternalResource27crags.externalResourcesFk],
    references: [routeExternalResources.id],
  }),
  region: one(regions, { fields: [routeExternalResource27crags.regionFk], references: [regions.id] }),
}))

export const routeExternalResourceTheCrag = table(
  'route_external_resource_the_crag',
  {
    id: baseFields.id,
    ...baseRegionFields,
    description: text('description'),
    externalResourcesFk: integer('external_resources_fk')
      .notNull()
      .references((): AnyColumn => routeExternalResources.id),
    grade: text('grade'),
    name: text('name'),
    node: bigint('node', { mode: 'number' }),
    rating: integer('rating'),

    tags: text('tags'),

    url: text('url'),
  },
  () => createBasicTablePolicies('route_external_resource_the_crag'),
).enableRLS()
export type InsertRouteExternalResourceTheCrag = InferInsertModel<typeof routeExternalResourceTheCrag>
export type RouteExternalResourceTheCrag = InferSelectModel<typeof routeExternalResourceTheCrag>

export const routeExternalResourceTheCragRelations = relations(routeExternalResourceTheCrag, ({ one }) => ({
  externalResources: one(routeExternalResources, {
    fields: [routeExternalResourceTheCrag.externalResourcesFk],
    references: [routeExternalResources.id],
  }),
  region: one(regions, { fields: [routeExternalResourceTheCrag.regionFk], references: [regions.id] }),
}))

export const firstAscensionists = table(
  'first_ascensionists',
  {
    id: baseFields.id,
    ...baseRegionFields,

    name: text('name').notNull(),
    userFk: integer('user_fk').references((): AnyColumn => users.id),
  },
  (table) => [
    index('first_ascensionists_name_idx').on(table.name),
    index('first_ascensionists_region_fk_idx').on(table.regionFk),
    index('first_ascensionists_user_fk_idx').on(table.userFk),

    policy(
      `${REGION_PERMISSION_READ} can fully access first_ascensionists`,
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()

export type FirstAscensionist = InferSelectModel<typeof firstAscensionists>
export type InsertFirstAscensionist = InferInsertModel<typeof firstAscensionists>

export const firstAscensionistsRelations = relations(firstAscensionists, ({ many, one }) => ({
  region: one(regions, { fields: [firstAscensionists.regionFk], references: [regions.id] }),
  routes: many(routesToFirstAscensionists),

  user: one(users, { fields: [firstAscensionists.userFk], references: [users.id] }),
}))

export const routesToFirstAscensionists = table(
  'routes_to_first_ascensionists',
  {
    id: baseFields.id,
    ...baseRegionFields,

    firstAscensionistFk: integer('first_ascensionist_fk')
      .notNull()
      .references((): AnyColumn => firstAscensionists.id),
    routeFk: integer('route_fk')
      .notNull()
      .references((): AnyColumn => routes.id),
  },
  (table) => [
    index('routes_to_first_ascensionists_first_ascensionist_fk_idx').on(table.firstAscensionistFk),
    index('routes_to_first_ascensionists_route_fk_idx').on(table.routeFk),

    policy(
      `${REGION_PERMISSION_READ} can fully access routes_to_first_ascensionists`,
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()

export const routesToFirstAscensionistsRelations = relations(routesToFirstAscensionists, ({ one }) => ({
  firstAscensionist: one(firstAscensionists, {
    fields: [routesToFirstAscensionists.firstAscensionistFk],
    references: [firstAscensionists.id],
  }),
  region: one(regions, { fields: [routesToFirstAscensionists.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [routesToFirstAscensionists.routeFk], references: [routes.id] }),
}))

export const ascentTypeEnum: ['flash', 'send', 'repeat', 'attempt'] = ['flash', 'send', 'repeat', 'attempt']
export const ascents = table(
  'ascents',
  {
    ...baseFields,
    ...baseRegionFields,
    createdBy: baseContentFields.createdBy,

    dateTime: date('date_time').notNull().defaultNow(),
    gradeFk: integer('grade_fk').references((): AnyColumn => grades.id),
    humidity: integer('humidity'),
    notes: text('notes'),
    rating: integer('rating'),
    routeFk: integer('route_fk')
      .notNull()
      .references((): AnyColumn => routes.id),

    temperature: integer('temperature'),
    type: text('type', { enum: ascentTypeEnum }).notNull(),
  },
  (table) => [
    index('ascents_created_by_idx').on(table.createdBy),
    index('ascents_notes_idx').on(table.notes),
    index('ascents_region_fk_idx').on(table.regionFk),
    index('ascents_route_fk_idx').on(table.routeFk),

    policy(
      `${REGION_PERMISSION_READ} can insert ascents`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read ascents`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can update their own ascents`,
      getPolicyConfig(
        'update',
        sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can delete their own ascents`,
      getPolicyConfig(
        'delete',
        sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = created_by
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
    policy(
      `${REGION_PERMISSION_ADMIN} can fully access ascents`,
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_ADMIN),
    ),
  ],
).enableRLS()
export type Ascent = InferSelectModel<typeof ascents>
export type InsertAscent = InferInsertModel<typeof ascents>

export const ascentsRelations = relations(ascents, ({ many, one }) => ({
  author: one(users, { fields: [ascents.createdBy], references: [users.id] }),
  files: many(files),
  grade: one(grades, { fields: [ascents.gradeFk], references: [grades.id] }),
  region: one(regions, { fields: [ascents.regionFk], references: [regions.id] }),

  route: one(routes, { fields: [ascents.routeFk], references: [routes.id] }),
}))

export const files = table(
  'files',
  {
    id: text('id')
      .$defaultFn(() => createCuid2())
      .primaryKey(),
    ...baseRegionFields,

    areaFk: integer('area_fk').references((): AnyColumn => areas.id),

    ascentFk: integer('ascent_fk').references((): AnyColumn => ascents.id),

    blockFk: integer('block_fk').references((): AnyColumn => blocks.id),
    bunnyStreamFk: uuid('bunny_stream_fk').references((): AnyColumn => bunnyStreams.id, { onDelete: 'set null' }),

    // Upload time. Files opt out of baseFields (they keep a cuid2 id), so the
    // timestamp is declared here. Sorts the media grid; backfilled from the
    // matching `uploaded` activity for pre-existing rows (see the migration).
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Uploader. Set at insert (finalizeImage/finalizeVideo); backfilled for
    // pre-existing rows from the upload activity, the parent entity's creator,
    // or the region creator as a last resort (see migration 0079).
    createdBy: baseContentFields.createdBy,

    height: integer('height'),
    // '' for video rows — the media lives at the video host (see finalizeVideo);
    // discriminate on bunnyStreamFk before treating the path as a storage location.
    path: text('path').notNull(),
    routeFk: integer('route_fk').references((): AnyColumn => routes.id),
    visibility: text('visibility', { enum: areaVisibilityEnum }),
    // EXIF-oriented pixel size of the image at `path` (what browsers display).
    // Consumers treat it as aspect ratio + coordinate space — the actually loaded
    // image may be a smaller derivative. Null for non-images or unread files.
    width: integer('width'),
  },
  (table) => [
    index('files_area_fk_idx').on(table.areaFk),
    index('files_ascent_fk_idx').on(table.ascentFk),
    index('files_block_fk_idx').on(table.blockFk),
    index('files_created_by_idx').on(table.createdBy),
    index('files_region_fk_idx').on(table.regionFk),
    index('files_route_fk_idx').on(table.routeFk),

    policy(
      `${REGION_PERMISSION_READ} can insert files`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read files`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can update files`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_EDIT),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can delete files`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),
    policy(
      `${REGION_PERMISSION_READ} can update files belonging to their own ascents`,
      getPolicyConfig(
        'update',
        sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can delete files belonging to their own ascents`,
      getPolicyConfig(
        'delete',
        sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.ascents a
              JOIN public.users u ON a.created_by = u.id
            WHERE
              a.id = ascent_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
  ],
).enableRLS()
export type File = InferSelectModel<typeof files>
export type InsertFile = InferInsertModel<typeof files>

export const filesRelations = relations(files, ({ one }) => ({
  area: one(areas, { fields: [files.areaFk], references: [areas.id] }),
  ascent: one(ascents, { fields: [files.ascentFk], references: [ascents.id] }),
  author: one(users, { fields: [files.createdBy], references: [users.id] }),
  block: one(blocks, { fields: [files.blockFk], references: [blocks.id] }),
  bunnyStream: one(bunnyStreams, { fields: [files.bunnyStreamFk], references: [bunnyStreams.id] }),
  region: one(regions, { fields: [files.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [files.routeFk], references: [routes.id] }),
}))

export const bunnyStreams = table(
  'bunny_streams',
  {
    id: uuid('id').primaryKey(),
    ...baseRegionFields,

    fileFk: text('file_fk').references((): AnyColumn => files.id, { onDelete: 'set null' }),
    /** Where the clip was grabbed from (a YouTube/Instagram URL), credited on the route
     *  page. Only route uploads ask for it; null for own footage and ascent clips. */
    source: text('source'),
  },
  (table) => [
    index('bunny_streams_region_fk_idx').on(table.regionFk),
    index('bunny_streams_file_fk_idx').on(table.fileFk),

    policy(
      `${REGION_PERMISSION_READ} can insert bunny_streams`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read bunny_streams`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can update bunny_streams`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_EDIT),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can delete bunny_streams`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),
    policy(
      `${REGION_PERMISSION_READ} can update bunny_streams for files of their own ascents`,
      getPolicyConfig(
        'update',
        sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can delete bunny_streams for files of their own ascents`,
      getPolicyConfig(
        'delete',
        sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.files f
              JOIN public.ascents a ON f.ascent_fk = a.id
              JOIN public.users u ON a.created_by = u.id
            WHERE
              f.id = file_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
    policy(
      `${REGION_PERMISSION_ADMIN} can fully access bunny_streams`,
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_ADMIN),
    ),
  ],
).enableRLS()
export type BunnyStream = InferSelectModel<typeof bunnyStreams>
export type InsertBunnyStream = InferInsertModel<typeof bunnyStreams>

export const bunnyStreamsRelations = relations(bunnyStreams, ({ one }) => ({
  file: one(files, { fields: [bunnyStreams.fileFk], references: [files.id] }),
  region: one(regions, { fields: [bunnyStreams.regionFk], references: [regions.id] }),
}))

export const topos = table(
  'topos',
  {
    id: baseFields.id,
    ...baseRegionFields,

    blockFk: integer('block_fk').references((): AnyColumn => blocks.id),

    fileFk: text('file_fk').references((): AnyColumn => files.id),
    order: integer('order').notNull().default(0),
  },
  (table) => [
    index('topos_block_fk_idx').on(table.blockFk),
    index('topos_region_fk_idx').on(table.regionFk),
    index('topos_file_fk_idx').on(table.fileFk),

    ...createBasicTablePolicies('topos'),
    policy(
      `${REGION_PERMISSION_EDIT} can delete topos`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),
  ],
).enableRLS()
export type InsertTopo = InferInsertModel<typeof topos>
export type Topo = InferSelectModel<typeof topos>

export const toposRelations = relations(topos, ({ many, one }) => ({
  block: one(blocks, { fields: [topos.blockFk], references: [blocks.id] }),
  file: one(files, { fields: [topos.fileFk], references: [files.id] }),
  region: one(regions, { fields: [topos.regionFk], references: [regions.id] }),

  routes: many(topoRoutes),
}))

export const topoRouteTopTypeEnum: ['top', 'topout'] = ['top', 'topout']
export const topoRoutes = table(
  'topo_routes',
  {
    id: baseFields.id,
    ...baseRegionFields,

    path: text('path'),
    routeFk: integer('route_fk').references((): AnyColumn => routes.id),

    topoFk: integer('topo_fk').references((): AnyColumn => topos.id),
    topType: text('top_type', { enum: topoRouteTopTypeEnum }).notNull(),
  },
  (table) => [
    index('topo_routes_region_fk_idx').on(table.regionFk),
    index('topo_routes_route_fk_idx').on(table.routeFk),
    index('topo_routes_topo_fk_idx').on(table.topoFk),

    ...createBasicTablePolicies('topo_routes'),
    policy(
      `${REGION_PERMISSION_EDIT} can delete topo_routes`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),
  ],
).enableRLS()
export type InsertTopoRoute = InferInsertModel<typeof topoRoutes>
export type TopoRoute = InferSelectModel<typeof topoRoutes>

export const topoRoutesRelations = relations(topoRoutes, ({ one }) => ({
  region: one(regions, { fields: [topoRoutes.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [topoRoutes.routeFk], references: [routes.id] }),
  topo: one(topos, { fields: [topoRoutes.topoFk], references: [topos.id] }),
}))

export const routesToTags = table(
  'routes_to_tags',
  {
    ...baseRegionFields,
    routeFk: integer('route_fk')
      .notNull()
      .references((): AnyColumn => routes.id),
    tagFk: text('tag_fk')
      .notNull()
      .references((): AnyColumn => tags.id),
  },
  (table) => [
    index('routes_to_tags_region_fk_idx').on(table.regionFk),
    index('routes_to_tags_route_fk_idx').on(table.routeFk),
    index('routes_to_tags_tag_fk_idx').on(table.tagFk),

    ...createBasicTablePolicies('routes_to_tags'),
    policy(
      `${REGION_PERMISSION_EDIT} can delete routes_to_tags`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT),
    ),

    primaryKey({ columns: [table.routeFk, table.tagFk] }),
  ],
).enableRLS()

export const routesToTagsRelations = relations(routesToTags, ({ one }) => ({
  region: one(regions, { fields: [routesToTags.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [routesToTags.routeFk], references: [routes.id] }),
  tag: one(tags, { fields: [routesToTags.tagFk], references: [tags.id] }),
}))

export const geolocations = table(
  'geolocations',
  {
    id: baseFields.id,
    ...baseRegionFields,

    areaFk: integer('area_fk').references((): AnyColumn => areas.id),
    blockFk: integer('block_fk').references((): AnyColumn => blocks.id),
    estimated: boolean('estimated').notNull().default(false),

    lat: doublePrecision('lat').notNull(),
    long: doublePrecision('long').notNull(),
  },
  (table) => [
    index('geolocations_area_fk_idx').on(table.areaFk),
    index('geolocations_block_fk_idx').on(table.blockFk),
    index('geolocations_region_fk_idx').on(table.regionFk),

    ...createBasicTablePolicies('geolocations'),
    policy(
      `${REGION_PERMISSION_READ} can insert geolocations`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can delete geolocations`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_EDIT),
    ),
  ],
).enableRLS()
export type Geolocation = InferSelectModel<typeof geolocations>
export type InsertGeolocation = InferInsertModel<typeof geolocations>

export const geolocationsRelations = relations(geolocations, ({ one }) => ({
  area: one(areas, { fields: [geolocations.areaFk], references: [areas.id] }),
  block: one(blocks, { fields: [geolocations.blockFk], references: [blocks.id] }),
  region: one(regions, { fields: [geolocations.regionFk], references: [regions.id] }),
}))

export const activityType: ['created', 'updated', 'deleted', 'uploaded'] = ['created', 'updated', 'deleted', 'uploaded']
export const activityParentEntityType: ['block', 'route', 'area', 'ascent'] = ['block', 'route', 'area', 'ascent']

export const activities = table(
  'activities',
  {
    ...baseFields,
    ...baseRegionFields,

    columnName: text('column_name'), // Only populated for 'updated' activities
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type', { enum: [...activityParentEntityType, 'file', 'user'] }).notNull(),
    metadata: text('metadata'), // JSON string containing relevant changes
    newValue: text('new_value'), // Only populated for 'updated' activities
    notified: boolean('notified'),
    oldValue: text('old_value'), // Only populated for 'updated' activities
    parentEntityId: text('parent_entity_id'),
    parentEntityType: text('parent_entity_type', { enum: activityParentEntityType }),
    type: pgEnum('activity_type', activityType)('type').notNull(),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('activities_created_at_idx').on(table.createdAt),
    index('activities_entity_id_idx').on(table.entityId),
    index('activities_entity_type_idx').on(table.entityType),
    index('activities_notified_idx').on(table.notified),
    index('activities_parent_entity_id_idx').on(table.parentEntityId),
    index('activities_type_idx').on(table.type),
    index('activities_user_fk_idx').on(table.userFk),
    index('activities_region_fk_idx').on(table.regionFk),

    policy(
      `${REGION_PERMISSION_READ} can insert activities`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read activities`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    policy(
      `${REGION_PERMISSION_DELETE} can delete activities`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_DELETE),
    ),
    policy(
      `${REGION_PERMISSION_READ} can delete their own activities`,
      getOwnActivityPolicyConfig('delete', REGION_PERMISSION_READ),
    ),
    // Without this, `createUpdateActivity`'s debounce silently loses writes: a table with RLS on
    // denies any command it has no policy for, so its merge-into-the-existing-row UPDATE matched
    // nothing and the change had already been taken off the insert list.
    policy(
      `${REGION_PERMISSION_READ} can update their own activities`,
      getOwnActivityPolicyConfig('update', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()

export type Activity = InferSelectModel<typeof activities>
export type InsertActivity = InferInsertModel<typeof activities>

export const activitiesRelations = relations(activities, ({ one }) => ({
  region: one(regions, { fields: [activities.regionFk], references: [regions.id] }),
  user: one(users, { fields: [activities.userFk], references: [users.id] }),
}))

export const favoriteEntityType: ['block', 'route', 'area'] = ['block', 'route', 'area']

export const favorites = table(
  'favorites',
  {
    ...baseFields,
    ...baseRegionFields,

    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    entityId: text('entity_id').notNull(),

    entityType: text('entity_type', { enum: favoriteEntityType }).notNull(),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('favorites_created_at_idx').on(table.createdAt),
    index('favorites_entity_id_idx').on(table.entityId),
    index('favorites_entity_type_idx').on(table.entityType),

    policy(`users can insert own favorites`, getOwnEntryPolicyConfig('insert')),
    policy(
      `${REGION_PERMISSION_READ} can read favorites`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    policy(`users can update own favorites`, getOwnEntryPolicyConfig('update')),
    policy(`users can delete own favorites`, getOwnEntryPolicyConfig('delete')),
  ],
).enableRLS()

export type Favorite = InferSelectModel<typeof favorites>
export type InsertFavorite = InferInsertModel<typeof favorites>

export const favoritesRelations = relations(favorites, ({ one }) => ({
  authUser: one(authUsers, { fields: [favorites.authUserFk], references: [authUsers.id] }),
  region: one(regions, { fields: [favorites.regionFk], references: [regions.id] }),
  user: one(users, { fields: [favorites.userFk], references: [users.id] }),
}))

export const clientErrorLogs = table('client_error_logs', {
  ...baseFields,
  createdBy: integer('created_by').references((): AnyColumn => users.id),
  error: text(),
  navigator: jsonb().$type<z.infer<ReturnType<typeof z.json>>>(),
  pathname: text(),
}).enableRLS()

export type ClientErrorLogs = InferSelectModel<typeof clientErrorLogs>
export type InsertClientErrorLog = InferInsertModel<typeof clientErrorLogs>
