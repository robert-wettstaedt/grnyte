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
import {
  APP_PERMISSION_ADMIN,
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '../auth'
import {
  createBasicTablePolicies,
  getAuthorizedInRegionPolicyConfig,
  getAuthorizedPolicyConfig,
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

export const generateSlug = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD') // Normalize the string
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric characters except spaces and hyphens
    .trim() // Trim whitespace from both ends
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/--+/g, '-') // Replace multiple hyphens with a single hyphen
    .replace(/^-|-$/g, '') // Remove leading and trailing hyphens

const baseFields = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: serial('id').primaryKey(),
}

const baseContentFields = {
  createdBy: integer('created_by')
    .notNull()
    .references((): AnyColumn => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
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
  region_user: 'User',
  region_maintainer: 'Maintainer',
  region_admin: 'Admin',
}

export const userRoles = table(
  'user_roles',
  {
    id: baseFields.id,
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    role: appRole().notNull(),
  },
  () => [
    policy('auth admins can read user_roles', READ_AUTH_ADMIN_POLICY_CONFIG),
    policy(`users can read own user_roles`, getOwnEntryPolicyConfig('select')),
  ],
).enableRLS()

export const rolePermissions = table(
  'role_permissions',
  {
    id: baseFields.id,
    role: appRole().notNull(),
    permission: appPermission().notNull(),
  },
  () => [policy('authenticated users can read role_permissions', getPolicyConfig('select', sql`true`))],
)

export const users = table(
  'users',
  {
    ...baseFields,
    username: text('username').notNull(),

    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    firstAscensionistFk: integer('first_ascentionist_fk').references((): AnyColumn => firstAscensionists.id),
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
export type User = InferSelectModel<typeof users>
export type InsertUser = InferInsertModel<typeof users>

export const usersRelations = relations(users, ({ one, many }) => ({
  authUser: one(authUsers, { fields: [users.authUserFk], references: [authUsers.id] }),
  firstAscensionist: one(firstAscensionists, {
    fields: [users.firstAscensionistFk],
    references: [firstAscensionists.id],
  }),
  userSettings: one(userSettings, { fields: [users.userSettingsFk], references: [userSettings.id] }),

  areas: many(areas),
  ascents: many(ascents),
  blocks: many(blocks),
  routes: many(routes),
  pushSubscriptions: many(pushSubscriptions),
}))

export const userSettings = table(
  'user_settings',
  {
    id: baseFields.id,

    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),

    cookie8a: text('cookie_8a'),
    cookie27crags: text('cookie_27crags'),
    cookieTheCrag: text('cookie_the_crag'),

    gradingScale: text('grading_scale', { enum: ['FB', 'V'] })
      .notNull()
      .default('FB'),

    notifyModerations: boolean('notify_moderations').notNull().default(false),
    notifyNewAscents: boolean('notify_new_ascents').notNull().default(false),
    notifyNewUsers: boolean('notify_new_users').notNull().default(false),
  },
  (table) => [
    index('user_settings_auth_user_fk_idx').on(table.authUserFk),
    index('user_settings_user_fk_idx').on(table.userFk),

    policy(`users can insert own users_settings`, getOwnEntryPolicyConfig('insert')),
    policy(`users can read own users_settings`, getOwnEntryPolicyConfig('select')),
    policy(`users can update own users_settings`, getOwnEntryPolicyConfig('update')),
  ],
).enableRLS()
export type UserSettings = InferSelectModel<typeof userSettings>
export type InsertUserSettings = InferInsertModel<typeof userSettings>

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  authUser: one(authUsers, { fields: [userSettings.authUserFk], references: [authUsers.id] }),
  user: one(users, { fields: [userSettings.userFk], references: [users.id] }),
}))

export const pushSubscriptions = table(
  'push_subscriptions',
  {
    id: baseFields.id,

    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),

    endpoint: text('endpoint').notNull(),
    expirationTime: integer('expiration_time'),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
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

export type PushSubscription = InferSelectModel<typeof pushSubscriptions>
export type InsertPushSubscription = InferInsertModel<typeof pushSubscriptions>

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  authUser: one(authUsers, { fields: [pushSubscriptions.authUserFk], references: [authUsers.id] }),
  user: one(users, { fields: [pushSubscriptions.userFk], references: [users.id] }),
}))

export const regions = table(
  'regions',
  {
    ...baseFields,
    createdBy: baseContentFields.createdBy,
    name: baseContentFields.name,
    settings: jsonb('settings').$type<RegionSettings>(),
  },
  (table) => [
    index('regions_name_idx').on(table.name),

    policy('authenticated users can create regions', getPolicyConfig('insert', sql`true`)),
    policy(`${APP_PERMISSION_ADMIN} can fully access regions`, getPolicyConfig('all', sql`true`)),
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
    policy(
      `${REGION_PERMISSION_ADMIN} can update region that they are members of`,
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
  ],
).enableRLS()
export type Region = InferSelectModel<typeof regions>
export type InsertRegion = InferInsertModel<typeof regions>

export const regionMembers = table(
  'region_members',
  {
    ...baseFields,
    ...baseRegionFields,
    role: appRole().notNull(),
    isActive: boolean('is_active').notNull().default(true),

    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    invitedBy: integer('invited_by').references((): AnyColumn => users.id),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('region_members_auth_user_fk_idx').on(table.authUserFk),
    index('region_members_region_fk_idx').on(table.regionFk),
    index('region_members_user_fk_idx').on(table.userFk),

    policy(
      `${APP_PERMISSION_ADMIN} can fully access region_members`,
      getAuthorizedPolicyConfig('all', APP_PERMISSION_ADMIN),
    ),
    policy('authenticated users can read region_members', getPolicyConfig('select', sql`true`)),
    policy('users can insert own region_members', getOwnEntryPolicyConfig('insert')),
    policy('users can update own region_members', getOwnEntryPolicyConfig('update')),
    policy('users can delete own region_members', getOwnEntryPolicyConfig('delete')),
  ],
).enableRLS()
export type RegionMember = InferSelectModel<typeof regionMembers>
export type InsertRegionMember = InferInsertModel<typeof regionMembers>

export const regionMembersRelations = relations(regionMembers, ({ one }) => ({
  authUser: one(authUsers, { fields: [regionMembers.authUserFk], references: [authUsers.id] }),
  invitedBy: one(users, { fields: [regionMembers.invitedBy], references: [users.id] }),
  region: one(regions, { fields: [regionMembers.regionFk], references: [regions.id] }),
  user: one(users, { fields: [regionMembers.userFk], references: [users.id] }),
}))

export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'expired'])

export const regionInvitations = table(
  'region_invitations',
  {
    ...baseFields,
    ...baseRegionFields,
    token: uuid('token').notNull().unique(),
    invitedBy: integer('invited_by')
      .notNull()
      .references((): AnyColumn => users.id),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: integer('accepted_by').references((): AnyColumn => users.id),
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
    policy(`users can read region_invitations`, getPolicyConfig('select', sql`true`)),
    policy(`users can update region_invitations`, getPolicyConfig('update', sql`true`)),
  ],
).enableRLS()

export const regionInvitationsRelations = relations(regionInvitations, ({ one }) => ({
  region: one(regions, { fields: [regionInvitations.regionFk], references: [regions.id] }),
  invitedBy: one(users, { fields: [regionInvitations.invitedBy], references: [users.id] }),
  acceptedBy: one(users, { fields: [regionInvitations.acceptedBy], references: [users.id] }),
}))

export const grades = table(
  'grades',
  {
    id: baseFields.id,

    FB: text('FB'),
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
export type Tag = InferSelectModel<typeof tags>
export type InsertTag = InferInsertModel<typeof tags>

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
export const areaTypeEnum: ['area', 'crag', 'sector'] = ['area', 'crag', 'sector']
export const areas = table(
  'areas',
  {
    ...baseFields,
    ...baseContentFields,
    ...baseRegionFields,

    description: text('description'),
    type: text('type', { enum: areaTypeEnum }).notNull().default('area'),
    visibility: text('visibility', { enum: areaVisibilityEnum }),
    walkingPaths: text('walking_paths').array(),

    parentFk: integer('parent_fk').references((): AnyColumn => areas.id),
  },
  (table) => [
    index('areas_description_idx').on(table.description),
    index('areas_region_fk_idx').on(table.regionFk),
    index('areas_slug_idx').on(table.slug),

    ...createBasicTablePolicies('areas'),
    policy(
      `${REGION_PERMISSION_READ} can update areas`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()
export type Area = InferSelectModel<typeof areas>
export type InsertArea = InferInsertModel<typeof areas>

export const areasRelations = relations(areas, ({ one, many }) => ({
  author: one(users, { fields: [areas.createdBy], references: [users.id] }),
  parent: one(areas, { fields: [areas.parentFk], references: [areas.id], relationName: 'area-to-area' }),
  region: one(regions, { fields: [areas.regionFk], references: [regions.id] }),

  areas: many(areas, { relationName: 'area-to-area' }),
  blocks: many(blocks),
  files: many(files),
  parkingLocations: many(geolocations),
}))

export const blocks = table(
  'blocks',
  {
    ...baseFields,
    ...baseContentFields,
    ...baseRegionFields,

    order: integer('order').notNull(),

    areaFk: integer('area_fk')
      .notNull()
      .references((): AnyColumn => areas.id),
    geolocationFk: integer('geolocation_fk').references((): AnyColumn => geolocations.id),
  },
  (table) => [
    index('blocks_region_fk_idx').on(table.regionFk),
    index('blocks_slug_idx').on(table.slug),

    ...createBasicTablePolicies('blocks'),
    policy(
      `${REGION_PERMISSION_READ} can update blocks`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_READ),
    ),
  ],
).enableRLS()
export type Block = InferSelectModel<typeof blocks>
export type InsertBlock = InferInsertModel<typeof blocks>

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  area: one(areas, { fields: [blocks.areaFk], references: [areas.id] }),
  author: one(users, { fields: [blocks.createdBy], references: [users.id] }),
  geolocation: one(geolocations, { fields: [blocks.geolocationFk], references: [geolocations.id] }),
  region: one(regions, { fields: [blocks.regionFk], references: [regions.id] }),

  files: many(files),
  routes: many(routes),
  topos: many(topos),
}))

export const routes = table(
  'routes',
  {
    ...baseFields,
    ...baseContentFields,
    ...baseRegionFields,

    description: text('description'),
    rating: integer('rating'),
    firstAscentYear: integer('first_ascent_year'),
    userRating: integer('user_rating'),

    areaFks: integer('area_fks').array(),
    blockFk: integer('block_fk')
      .notNull()
      .references((): AnyColumn => blocks.id),
    externalResourcesFk: integer('external_resources_fk').references((): AnyColumn => routeExternalResources.id),
    gradeFk: integer('grade_fk').references((): AnyColumn => grades.id),
    userGradeFk: integer('user_grade_fk').references((): AnyColumn => grades.id),
  },
  (table) => [
    index('routes_block_fk_idx').on(table.blockFk),
    index('routes_description_idx').on(table.description),
    index('routes_region_fk_idx').on(table.regionFk),
    index('routes_slug_idx').on(table.slug),

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
export type Route = InferSelectModel<typeof routes>
export type InsertRoute = InferInsertModel<typeof routes>

export const routesRelations = relations(routes, ({ one, many }) => ({
  author: one(users, { fields: [routes.createdBy], references: [users.id] }),
  block: one(blocks, { fields: [routes.blockFk], references: [blocks.id] }),
  externalResources: one(routeExternalResources, {
    fields: [routes.externalResourcesFk],
    references: [routeExternalResources.id],
  }),
  grade: one(grades, { fields: [routes.gradeFk], references: [grades.id] }),
  region: one(regions, { fields: [routes.regionFk], references: [regions.id] }),

  firstAscents: many(routesToFirstAscensionists),
  ascents: many(ascents),
  files: many(files),
  tags: many(routesToTags),
}))

export const routeExternalResources = table(
  'route_external_resources',
  {
    id: baseFields.id,
    ...baseRegionFields,

    routeFk: integer('route_fk')
      .notNull()
      .references((): AnyColumn => routes.id),

    externalResource8aFk: integer('external_resource_8a_fk').references((): AnyColumn => routeExternalResource8a.id),
    externalResource27cragsFk: integer('external_resource_27crags_fk').references(
      (): AnyColumn => routeExternalResource27crags.id,
    ),
    externalResourceTheCragFk: integer('external_resource_the_crag_fk').references(
      (): AnyColumn => routeExternalResourceTheCrag.id,
    ),
  },

  (table) => [
    index('route_external_resources_route_fk_idx').on(table.routeFk),
    index('route_external_resources_region_fk_idx').on(table.regionFk),

    ...createBasicTablePolicies('route_external_resources'),
  ],
).enableRLS()
export type RouteExternalResource = InferSelectModel<typeof routeExternalResources>
export type InsertRouteExternalResource = InferInsertModel<typeof routeExternalResources>

export const routeExternalResourcesRelations = relations(routeExternalResources, ({ one }) => ({
  route: one(routes, { fields: [routeExternalResources.routeFk], references: [routes.id] }),
  region: one(regions, { fields: [routeExternalResources.regionFk], references: [regions.id] }),
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
}))

export const routeExternalResource8a = table(
  'route_external_resource_8a',
  {
    id: baseFields.id,
    ...baseRegionFields,
    zlaggableName: text('zlaggable_name'),
    zlaggableSlug: text('zlaggable_slug'),
    zlaggableId: integer('zlaggable_id'),
    cragName: text('crag_name'),
    cragSlug: text('crag_slug'),
    countrySlug: text('country_slug'),
    countryName: text('country_name'),
    areaName: text('area_name'),
    areaSlug: text('area_slug'),
    sectorName: text('sector_name'),
    sectorSlug: text('sector_slug'),
    gradeIndex: integer('grade_index'),
    type: integer('type'),
    category: integer('category'),
    averageRating: real('average_rating'),
    difficulty: text('difficulty'),

    url: text('url'),

    externalResourcesFk: integer('external_resources_fk')
      .notNull()
      .references((): AnyColumn => routeExternalResources.id),
  },
  () => createBasicTablePolicies('route_external_resource_8a'),
).enableRLS()
export type RouteExternalResource8a = InferSelectModel<typeof routeExternalResource8a>
export type InsertRouteExternalResource8a = InferInsertModel<typeof routeExternalResource8a>

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

    name: text('name'),
    searchable_id: integer('searchable_id'),
    searchable_type: text('searchable_type'),
    country_name: text('country_name'),
    location_name: text('location_name'),
    description: text('description'),
    crag_id: integer('crag_id'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    path: text('path'),

    url: text('url'),

    externalResourcesFk: integer('external_resources_fk')
      .notNull()
      .references((): AnyColumn => routeExternalResources.id),
  },
  () => createBasicTablePolicies('route_external_resource_27crags'),
).enableRLS()
export type RouteExternalResource27crags = InferSelectModel<typeof routeExternalResource27crags>
export type InsertRouteExternalResource27crags = InferInsertModel<typeof routeExternalResource27crags>

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
    name: text('name'),
    description: text('description'),
    grade: text('grade'),
    node: bigint('node', { mode: 'number' }),
    rating: integer('rating'),
    tags: text('tags'),

    url: text('url'),

    externalResourcesFk: integer('external_resources_fk')
      .notNull()
      .references((): AnyColumn => routeExternalResources.id),
  },
  () => createBasicTablePolicies('route_external_resource_the_crag'),
).enableRLS()
export type RouteExternalResourceTheCrag = InferSelectModel<typeof routeExternalResourceTheCrag>
export type InsertRouteExternalResourceTheCrag = InferInsertModel<typeof routeExternalResourceTheCrag>

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

export const firstAscensionistsRelations = relations(firstAscensionists, ({ one, many }) => ({
  region: one(regions, { fields: [firstAscensionists.regionFk], references: [regions.id] }),
  user: one(users, { fields: [firstAscensionists.userFk], references: [users.id] }),

  routes: many(routesToFirstAscensionists),
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
    notes: text('notes'),
    rating: integer('rating'),
    type: text('type', { enum: ascentTypeEnum }).notNull(),

    gradeFk: integer('grade_fk').references((): AnyColumn => grades.id),
    routeFk: integer('route_fk')
      .notNull()
      .references((): AnyColumn => routes.id),
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

export const ascentsRelations = relations(ascents, ({ one, many }) => ({
  author: one(users, { fields: [ascents.createdBy], references: [users.id] }),
  grade: one(grades, { fields: [ascents.gradeFk], references: [grades.id] }),
  region: one(regions, { fields: [ascents.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [ascents.routeFk], references: [routes.id] }),

  files: many(files),
}))

export const files = table(
  'files',
  {
    id: text('id')
      .$defaultFn(() => createCuid2())
      .primaryKey(),
    ...baseRegionFields,

    path: text('path').notNull(),
    visibility: text('visibility', { enum: areaVisibilityEnum }),

    areaFk: integer('area_fk').references((): AnyColumn => areas.id),
    ascentFk: integer('ascent_fk').references((): AnyColumn => ascents.id),
    blockFk: integer('block_fk').references((): AnyColumn => blocks.id),
    bunnyStreamFk: uuid('bunny_stream_fk').references((): AnyColumn => bunnyStreams.id, { onDelete: 'set null' }),
    routeFk: integer('route_fk').references((): AnyColumn => routes.id),
  },
  (table) => [
    index('files_area_fk_idx').on(table.areaFk),
    index('files_ascent_fk_idx').on(table.ascentFk),
    index('files_block_fk_idx').on(table.blockFk),
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
export type Topo = InferSelectModel<typeof topos>
export type InsertTopo = InferInsertModel<typeof topos>

export const toposRelations = relations(topos, ({ one, many }) => ({
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

    topType: text('top_type', { enum: topoRouteTopTypeEnum }).notNull(),
    path: text('path'),

    routeFk: integer('route_fk').references((): AnyColumn => routes.id),
    topoFk: integer('topo_fk').references((): AnyColumn => topos.id),
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
export type TopoRoute = InferSelectModel<typeof topoRoutes>
export type InsertTopoRoute = InferInsertModel<typeof topoRoutes>

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

    lat: doublePrecision('lat').notNull(),
    long: doublePrecision('long').notNull(),

    areaFk: integer('area_fk').references((): AnyColumn => areas.id),
    blockFk: integer('block_fk').references((): AnyColumn => blocks.id),
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
  ],
).enableRLS()
export type Geolocation = InferSelectModel<typeof geolocations>
export type InsertGeolocation = InferInsertModel<typeof geolocations>

export const geolocationsRelations = relations(geolocations, ({ one }) => ({
  area: one(areas, { fields: [geolocations.areaFk], references: [areas.id] }),
  block: one(blocks, { fields: [geolocations.blockFk], references: [blocks.id] }),
  region: one(regions, { fields: [geolocations.regionFk], references: [regions.id] }),
}))

export const activityTypeEnum = pgEnum('activity_type', ['created', 'updated', 'deleted', 'uploaded'])

export const activities = table(
  'activities',
  {
    ...baseFields,
    ...baseRegionFields,

    type: activityTypeEnum('type').notNull(),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type', { enum: ['block', 'route', 'area', 'ascent', 'file', 'user'] }).notNull(),
    parentEntityId: text('parent_entity_id'),
    parentEntityType: text('parent_entity_type', { enum: ['block', 'route', 'area', 'ascent'] }),
    columnName: text('column_name'), // Only populated for 'updated' activities
    metadata: text('metadata'), // JSON string containing relevant changes
    oldValue: text('old_value'), // Only populated for 'updated' activities
    newValue: text('new_value'), // Only populated for 'updated' activities
    notified: boolean('notified'), // Whether this activity has been notified
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
      getPolicyConfig(
        'delete',
        sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
  ],
).enableRLS()

export type Activity = InferSelectModel<typeof activities>
export type InsertActivity = InferInsertModel<typeof activities>

export const activitiesRelations = relations(activities, ({ one }) => ({
  region: one(regions, { fields: [activities.regionFk], references: [regions.id] }),
  user: one(users, { fields: [activities.userFk], references: [users.id] }),
}))
