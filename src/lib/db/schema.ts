import {
  APP_PERMISSION_ADMIN,
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import type { RegionSettings } from '$lib/entities/region/settings'
import { createId as createCuid2 } from '@paralleldrive/cuid2'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
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
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn as AnyColumn,
} from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'
import z from 'zod'
import {
  createBasicTablePolicies,
  getAuthorizedInRegionPolicyConfig,
  getAuthorizedPolicyConfig,
  getConsistentMemberPolicyConfig,
  getDeniedPolicyConfig,
  getOwnEntryPolicyConfig,
  getOwnEventChildPolicyConfig,
  getOwnReactionPolicyConfig,
  getOwnRowPolicyConfig,
  getPolicyConfig,
  READ_AUTH_ADMIN_POLICY_CONFIG,
} from './policy'

const baseFields = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  id: serial('id').notNull().primaryKey(),
}

/**
 * ACCEPTED, and it applies to every attribution column in this file, not just this one:
 * `created_by` here, plus `user_fk`, `auth_user_fk`, `actor_fk` and the `region_invitations`
 * identity columns, are all MUTABLE at the database level. No policy binds a row to its author, and
 * no trigger pins one after the fact.
 *
 * That is deliberate. RLS here answers one question, whether the caller may touch a row belonging to
 * this region, and attribution is enforced in application code instead: every handler stamps the
 * author from the session, never from the request. The `no-drizzle-mass-assignment` lint rule is
 * what keeps that true, because the way it stops being true is a payload spread into a write rather
 * than anybody deciding to forge a byline.
 *
 * So: if you add a handler that writes one of these columns, it takes the value from `ctx.user`.
 * Nothing underneath will catch you if it does not.
 */
const baseContentFields = {
  createdBy: integer('created_by')
    .notNull()
    .references((): AnyColumn => users.id),
  name: text('name').notNull(),
}

/** When set, the row is considered deleted but kept for recovery. */
const softDeleteFields = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

const baseRegionFields = {
  regionFk: integer('region_fk')
    .notNull()
    .references((): AnyColumn => regions.id),
}

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
  (table) => [
    policy('auth admins can read user_roles', READ_AUTH_ADMIN_POLICY_CONFIG),
    policy(`users can read own user_roles`, getOwnEntryPolicyConfig('select', table.authUserFk)),
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
    // ACCEPTED: this compares `auth_user_fk` and nothing else, so it says WHOSE row may be written
    // and never WHICH column. In particular nothing stops `user_settings_fk` being pointed at
    // somebody else's settings row, which would make the server read their preferences as yours
    // (the client reads settings through this link while the digest reads by `user_fk`).
    // Latent rather than live: the only writers are `writeUserSettings` and the signup path, both of
    // which set it from a row they just created. A handler that ever takes it from a request has to
    // validate it, because the database will not.
    policy('users can update own users', getOwnEntryPolicyConfig('update', table.authUserFk)),
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

    // The language we write TO this account in (email now, push later). Deliberately not named
    // `locale`: the UI language stays per device (the paraglide cookie), so one shared field would
    // weld somebody's phone and their laptop together. null = no signal, fall back to the sender's
    // ambient locale. Written from explicit picks only, never from an auto-detected browser language.
    contactLocale: text('contact_locale'),
    cookie8a: text('cookie_8a'),
    cookie27crags: text('cookie_27crags'),

    cookieTheCrag: text('cookie_the_crag'),
    gradingScale: text('grading_scale', { enum: ['FB', 'V'] })
      .notNull()
      .default('FB'),
    id: baseFields.id,

    /**
     * The six push switches. They govern PUSH and nothing else: a directed event always lands in
     * the inbox and a broadcast one always lands in the feed, whatever these say. There is
     * deliberately no way to turn the inbox off, because the point is that people discover
     * updates; this is only about not being disturbed while they do.
     *
     * All default true, because granting the browser its push permission is the opt-in. A
     * subscriber who then receives nothing reads it as broken, and a second opt-in buys nothing.
     */
    notifyAscents: boolean('notify_ascents').notNull().default(true),
    /** Push when somebody comments on a card you are part of: yours, or one you commented on. */
    notifyComments: boolean('notify_comments').notNull().default(true),
    notifyCommunity: boolean('notify_community').notNull().default(true),
    /** Push for the things aimed at you personally: mentions, your ascent, your role. */
    notifyDirected: boolean('notify_directed').notNull().default(true),

    /** Named for what it always governed: 1.0's `notify_moderations` fell through to 'moderate'
     *  for anything that was not an ascent or a user, so the flag covered every guidebook edit. */
    notifyGuidebookEdits: boolean('notify_guidebook_edits').notNull().default(true),
    /** Push when somebody reacts to something you logged or edited. */
    notifyReactions: boolean('notify_reactions').notNull().default(true),
    /**
     * The broadcast half's bookkeeping, two stamps rather than a row per user per event.
     *
     * `pushedUpTo` is how far a digest has covered this person; `seenUpTo` is how far they have
     * caught up in the feed. The digest counts what is above both, so reading the feed silences
     * the push for what was read, and a push does not repeat itself. Deliberately not foreign
     * keys: the undo flows delete rows, and a watermark must not block that.
     *
     * Both are set to the newest event's timestamp when a device first subscribes, so a brand-new
     * subscriber's first digest does not read "4,812 updates".
     *
     * TIMESTAMPS, not ids, unlike the `activities` pair they replaced. Event ids do not run with
     * their timestamps: the backfill emitted them in island order, so an event dated 2024 can hold
     * a higher id than one from last week, and "everything above this id" would then mean neither
     * "everything newer" nor anything else useful. Millisecond precision, matching
     * `events.created_at`, so a mark taken off a row compares exactly against it.
     */
    pushedUpToEventAt: timestamp('pushed_up_to_event_at', { precision: 3, withTimezone: true }),
    seenUpToEventAt: timestamp('seen_up_to_event_at', { precision: 3, withTimezone: true }),

    // null = follow the runtime locale (see isImperialLocale); set = explicit override.
    unitSystem: text('unit_system', { enum: ['metric', 'imperial'] }),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('user_settings_auth_user_fk_idx').on(table.authUserFk),
    // One settings row per person, enforced rather than assumed. The readers are what make it
    // matter: the client reads settings through `users.user_settings_fk` while the digest reads them
    // by `user_fk`, so two rows meant the app and the push job could disagree about somebody's
    // preferences, and which one a `findFirst` returned was undefined.
    uniqueIndex('user_settings_user_fk_idx').on(table.userFk),

    policy(`users can insert own users_settings`, getOwnEntryPolicyConfig('insert', table.authUserFk)),
    policy(`users can read own users_settings`, getOwnEntryPolicyConfig('select', table.authUserFk)),
    policy(`users can update own users_settings`, getOwnEntryPolicyConfig('update', table.authUserFk)),
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
    ...baseFields,
    auth: text('auth').notNull(),

    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    endpoint: text('endpoint').notNull(),

    expirationTime: integer('expiration_time'),
    p256dh: text('p256dh').notNull(),

    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('push_subscriptions_auth_user_fk_idx').on(table.authUserFk),
    index('push_subscriptions_user_fk_idx').on(table.userFk),
    // An endpoint IS the device. There was no constraint, so every re-subscribe (a service worker
    // update, a component remount, a subscription refresh) inserted another row and that one
    // device then received N copies of every push.
    uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint),

    policy(`users can delete own push_subscriptions`, getOwnEntryPolicyConfig('delete', table.authUserFk)),
    policy(`users can insert own push_subscriptions`, getOwnEntryPolicyConfig('insert', table.authUserFk)),
    policy(`users can read own push_subscriptions`, getOwnEntryPolicyConfig('select', table.authUserFk)),
    policy(`users can update own push_subscriptions`, getOwnEntryPolicyConfig('update', table.authUserFk)),
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

    // Nobody creates a region through RLS, app admins included. `createRegionForUser` runs on the
    // privileged handle because it has to count what a caller already owns and enforce
    // MAX_OWNED_REGIONS inside the same transaction, and the policy that used to sit here was
    // `true`, which enforced nothing and existed only as a way around that cap.
    //
    // Restrictive, not merely absent: the app.admin policy below is `all`, and permissive policies
    // are OR-ed, so dropping this one alone would leave the same hole open for the one role most
    // likely to be talked into using it.
    policy('nobody inserts regions', getDeniedPolicyConfig('insert')),
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
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_ADMIN, table.id),
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
    // Two tabs accepting the same invitation both pass the "already a member" read (postgres runs
    // read committed) and both insert. This is what closes that, and what `resolveRestore`'s
    // `alreadyMember` guard was standing in for. Reverses the call documented below it.
    uniqueIndex('region_members_region_user_unique').on(table.regionFk, table.userFk),

    policy(
      `${APP_PERMISSION_ADMIN} can fully access region_members`,
      getAuthorizedPolicyConfig('all', APP_PERMISSION_ADMIN),
    ),
    // The permission AND the row's two identity columns agreeing. `authorize_in_region` resolves
    // through `auth_user_fk` while every relation joins on `user_fk`, so a row naming different
    // people in each is one account holding another's rights in a region, under the wrong name in
    // the member list. Not bound to the caller: adding other people is the point of the table.
    policy(
      `${REGION_PERMISSION_ADMIN} can manage region_members`,
      getConsistentMemberPolicyConfig('all', REGION_PERMISSION_ADMIN, {
        authUserFk: table.authUserFk,
        regionFk: table.regionFk,
        userFk: table.userFk,
      }),
    ),
    // Scoped to the reader's own regions, not `true`: this table is what tenancy is made of, and a
    // blanket read let any signed-in user enumerate every region's membership - who is in it, their
    // role and their auth uid - including regions whose `regions` row they cannot see.
    policy(
      `${REGION_PERMISSION_READ} can read region_members`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    // No own-row insert or update: either one lets any authenticated user join an arbitrary region
    // as region_admin, or promote themselves once in. The invite-accept flow needs its own insert
    // policy keyed on a matching region_invitations row.
    // Deleting your own row stays open, so leaving a region does not need an admin.
    policy('users can delete own region_members', getOwnEntryPolicyConfig('delete', table.authUserFk)),
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
    /** When the mail last went out. Feeds the resend throttle and the "sent 3 days ago" line.
     *  `baseFields` has no `updatedAt`, and inferring recency from a refreshed `expiresAt` is the
     *  kind of cleverness that reads as a bug later. */
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
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
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_ADMIN, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_ADMIN} can update region_invitations`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_ADMIN, table.regionFk),
    ),
    policy(
      `region members can read region_invitations`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
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

    ...createBasicTablePolicies('areas', table.regionFk),
    // DELETE at edit (not delete): an area is only ever hard-deleted while bare, and the
    // gate that decides that is canDeleteArea. UPDATE stays at edit from the basic policies -
    // unlike `routes`, nothing writes an area on behalf of a read-only member.
    policy(
      `${REGION_PERMISSION_EDIT} can delete areas`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
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

    ...createBasicTablePolicies('blocks', table.regionFk),
    // Same as `areas`: delete at edit, update left at edit. No read-level writer exists.
    policy(
      `${REGION_PERMISSION_EDIT} can delete blocks`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
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

    ...createBasicTablePolicies('routes', table.regionFk),
    policy(
      `${REGION_PERMISSION_EDIT} can delete routes`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
    ),
    // The one table where UPDATE really is looser than its TS gate, and it has to be: logging an
    // ascent folds the member's grade/rating into the route (recalcUserGradeAndRating), and a plain
    // member holds only read. Editing route CONTENT still requires edit - see canEditRoute.
    //
    // ACCEPTED, and the widest gap in the schema: this grants UPDATE on EVERY column, because a
    // policy cannot name one. A read-only member can in principle rewrite a route's name,
    // description or grade, and `canEditRoute` in the handler is the only thing that stops them.
    // Authorization for column-level rules lives in application code now, so anything new that
    // updates `routes` has to ask `canEditRoute` for itself rather than assume this policy narrows
    // it.
    policy(
      `${REGION_PERMISSION_READ} can update routes`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_READ, table.regionFk),
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

    // Nothing inserts these: 1.0's sync against 8a.nu, 27crags and theCrag was never ported, so the
    // rows that exist came with the data and the app only ever reads them, clears the links and
    // deletes them. An insert policy would be a standing permission for a writer that does not
    // exist; porting the sync means adding it back deliberately.
    ...createBasicTablePolicies('route_external_resources', table.regionFk, ['insert']),
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
  (table) => createBasicTablePolicies('route_external_resource_8a', table.regionFk, ['insert', 'update']),
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
  (table) => createBasicTablePolicies('route_external_resource_27crags', table.regionFk, ['insert', 'update']),
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
  (table) => createBasicTablePolicies('route_external_resource_the_crag', table.regionFk, ['insert', 'update']),
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
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_READ, table.regionFk),
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
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_READ, table.regionFk),
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

/**
 * `redpoint` is the strict "sent it after working it" type, next to `flash` and `repeat`.
 * "Send" is the umbrella for all three (see CONTEXT.md); it is deliberately not a value here.
 */
export const ascentTypeEnum: ['flash', 'redpoint', 'repeat', 'attempt'] = ['flash', 'redpoint', 'repeat', 'attempt']
export const ascents = table(
  'ascents',
  {
    ...baseFields,
    ...baseRegionFields,
    // An ascent outlives its own deletion once `events` names it with a real foreign key: the log
    // has to survive what it describes, and a hard-deleted row would take its history with it.
    // Hard deletion is still what happens inside the 15-minute grace window, where the point is
    // that a mistake leaves no trace at all.
    ...softDeleteFields,
    /**
     * The one claim this send's feed card is allowed to make about it, as JSON, or null for the
     * ascents that earn none (which is most of them). See `deriveAccolade`.
     *
     * On the ASCENT rather than on its event, though only a card renders it, for two reasons. It
     * is a fact about the climb, so the ascent's own screen and the logbook can read the same
     * value rather than deriving a second opinion; and `events` has no member UPDATE policy under
     * RLS, so nothing a handler does could revise it, while an owner may always update their own
     * ascent. That second half is what makes the claim correctable at all: attempts are commonly
     * logged AFTER the send they belong to, and a send whose project only becomes visible the next
     * morning has to be able to gain its banner then.
     *
     * Written at emit and never recomputed on a clock. The ceiling claim is measured over a
     * rolling twelve months, so a live value would quietly strip banners off old cards as the
     * window slid: the claim means "as of the day they sent it", which stays true forever.
     */
    accolade: text('accolade'),
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
    index('ascents_deleted_at_idx').on(table.deletedAt),
    index('ascents_notes_idx').on(table.notes),
    index('ascents_region_fk_idx').on(table.regionFk),
    index('ascents_route_fk_idx').on(table.routeFk),

    policy(
      `${REGION_PERMISSION_READ} can insert ascents`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read ascents`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
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
          ) AND (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
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
          ) AND (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
    policy(
      `${REGION_PERMISSION_ADMIN} can fully access ascents`,
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_ADMIN, table.regionFk),
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
    // `path` is the lookup key for `/image/[...resourcePath]`, which now decides access from a single
    // query on it rather than leaning on an RLS-scoped read. That runs for every `<img>` and every
    // `?w=` derivative, so a gallery of 40 thumbnails was 40 sequential scans of `files`.
    // Not unique: paths repeat across rows (duplicates and orphans predate this) and the route reads
    // them all on purpose, since any row granting access unlocks the bytes.
    index('files_path_idx').on(table.path),
    index('files_region_fk_idx').on(table.regionFk),
    index('files_route_fk_idx').on(table.routeFk),

    policy(
      `${REGION_PERMISSION_READ} can insert files`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read files`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can update files`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_EDIT, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can delete files`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
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
          ) AND (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
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
          ) AND (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
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
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read bunny_streams`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can update bunny_streams`,
      getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_EDIT, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can delete bunny_streams`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
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
          ) AND (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
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
          ) AND (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))
        `),
      ),
    ),
    policy(
      `${REGION_PERMISSION_ADMIN} can fully access bunny_streams`,
      getAuthorizedInRegionPolicyConfig('all', REGION_PERMISSION_ADMIN, table.regionFk),
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

    ...createBasicTablePolicies('topos', table.regionFk),
    policy(
      `${REGION_PERMISSION_EDIT} can delete topos`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
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

    ...createBasicTablePolicies('topo_routes', table.regionFk),
    policy(
      `${REGION_PERMISSION_EDIT} can delete topo_routes`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
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
    // Free text rather than a foreign key: the vocabulary lives in `regions.settings.tags`, so each
    // region's admins own it and two regions may use the same word for different things. What may
    // be written here is checked against the target region's list in `routes.remote.ts`.
    tagFk: text('tag_fk').notNull(),
  },
  (table) => [
    index('routes_to_tags_region_fk_idx').on(table.regionFk),
    index('routes_to_tags_route_fk_idx').on(table.routeFk),
    index('routes_to_tags_tag_fk_idx').on(table.tagFk),

    ...createBasicTablePolicies('routes_to_tags', table.regionFk),
    policy(
      `${REGION_PERMISSION_EDIT} can delete routes_to_tags`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
    ),

    primaryKey({ columns: [table.routeFk, table.tagFk] }),
  ],
).enableRLS()

export const routesToTagsRelations = relations(routesToTags, ({ one }) => ({
  region: one(regions, { fields: [routesToTags.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [routesToTags.routeFk], references: [routes.id] }),
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

    ...createBasicTablePolicies('geolocations', table.regionFk),
    policy(
      `${REGION_PERMISSION_READ} can insert geolocations`,
      getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_READ, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_EDIT} can delete geolocations`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_EDIT, table.regionFk),
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

/**
 * Retired. Nothing in the app reads or writes this table any more, replaced by `events` and
 * `changes`; it is kept only so a future migration can drop it, and its policies are kept with it
 * so the rows stay readable to the same people until that happens.
 */
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
    // Without this, the activities log's debounced writer used to silently lose updates: a table
    // with RLS on denies any command it has no policy for, so its merge-into-the-existing-row
    // UPDATE matched nothing and the change had already been taken off the insert list.
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

/**
 * === EVENTS ===
 *
 * What happened, as opposed to what changed. See CONTEXT.md for the vocabulary. Replaces
 * `activities`: every mutation logs here, and the feed and the digest read from here too.
 * `activities` keeps its rows for now, retired rather than dropped.
 */

/**
 * AS2 verbs, taken rather than invented: <https://www.w3.org/TR/activitystreams-vocabulary/>.
 *
 * A subset. AS2 defines 28 and the rest belong to the federated social web (`Follow`, `Announce`,
 * `Flag`, `Question`, check-ins, read receipts). Four of those are plausible here later without
 * inventing anything, which is the argument for borrowing the vocabulary rather than minting our
 * own words.
 *
 * What this replaces: `activityType` plus `columnName`, where `created` + `column_name:
 * 'invitation'` was how we spelled `Invite`. That encoding is why a join contributed nothing to
 * `eventRefs` and why nobody who joined a region ever heard they had been welcomed.
 */
export const eventVerb: ['create', 'update', 'delete', 'add', 'remove', 'join', 'leave', 'invite', 'accept'] = [
  'create',
  'update',
  'delete',
  'add',
  'remove',
  'join',
  'leave',
  'invite',
  'accept',
]

/**
 * The AS2 object columns, shared verbatim by `events`, `changes` and `notifications`.
 *
 * Six nullable foreign keys rather than one polymorphic `(type, id)` pair. That pair could not be
 * joined by Zero at all, so every screen that had one ran a query per entity type and reconciled
 * the answers by hand, in a pass that also had to model "not here yet" separately from "gone".
 * Real keys arrive nested in one query, and that pass is deleted.
 *
 * `on delete cascade` on the five ENTITY keys is what makes the 15-minute grace window work: a
 * mistake deleted inside it is hard-deleted and takes its events with it, leaving no trace, while
 * anything older soft-deletes and keeps its history. Without the cascade the hard delete would be
 * blocked by its own log.
 *
 * `subject_fk` is deliberately NOT one of them. It points at a person, and people are not subject
 * to the grace window, so cascading there would mean deleting an account silently erases the
 * region's record of who invited, promoted or removed them. It matches `actor_fk` instead: a user
 * row with history cannot be hard-deleted at all, which is the same answer for both directions
 * rather than one that depends on which end of the sentence somebody was on.
 *
 * There is deliberately no `target`. A parent is reachable through the object's own key
 * (`files.route_fk`, `blocks.area_fk`), which is what `parent_entity_*` was standing in for.
 */
const eventObjectFields = {
  areaFk: integer('area_fk').references((): AnyColumn => areas.id, { onDelete: 'cascade' }),
  ascentFk: integer('ascent_fk').references((): AnyColumn => ascents.id, { onDelete: 'cascade' }),
  blockFk: integer('block_fk').references((): AnyColumn => blocks.id, { onDelete: 'cascade' }),
  fileFk: text('file_fk').references((): AnyColumn => files.id, { onDelete: 'cascade' }),
  routeFk: integer('route_fk').references((): AnyColumn => routes.id, { onDelete: 'cascade' }),
  /**
   * The person an event is about. Membership events only.
   *
   * Distinct from `actor_fk` in exactly one case, a role change, where somebody acts on somebody
   * else: "Jonas made Mara a maintainer". Everywhere else the two are the same person by nature.
   * Joining, leaving and accepting an invitation are things you do to your own membership, so
   * subject and actor are both you and that is not a bug.
   *
   * The one degenerate case is an invitation, both sending one (`invite`) and withdrawing one
   * (`remove`). An invitation names an email address, and the invitee has no account to point at,
   * so this holds the INVITER and the address lives in `metadata`, which is what the card renders
   * from. Do not read a subject off either.
   *
   * That makes `metadata` load-bearing on `remove`, which is also what a member removal writes:
   * an address means an invitation was withdrawn and this column is the actor, null means a person
   * was removed and it is them. Reading the verb alone renders "Jonas removed Jonas".
   */
  subjectFk: integer('subject_fk').references((): AnyColumn => users.id),
}

const EVENT_OBJECT_COLUMNS = 'area_fk, ascent_fk, block_fk, file_fk, route_fk, subject_fk'

export const events = table(
  'events',
  {
    ...baseFields,
    // Millisecond precision, unlike every other table's `created_at`. The feed pages on a
    // `(created_at, id)` cursor, and Zero compares this column as bigint millis: with Postgres'
    // default microseconds a synced row comes back as `…806.138`, which is not a bigint and
    // cannot be handed back as a bound. Rounding the cursor instead is not exact either, because
    // rows inside the rounded millisecond then fall on the wrong side of the cut.
    createdAt: timestamp('created_at', { precision: 3, withTimezone: true })
      .notNull()
      // `clock_timestamp()`, not `now()`, which is the TRANSACTION's start. Every mutation runs in
      // one, so an event written at the end of a long handler would carry the timestamp of that
      // handler's first statement, and a digest whose watermark had passed that instant meanwhile
      // would never see it. The feed's cursor reads the same column and has the same stake in it.
      .default(sql`clock_timestamp()`),
    ...baseRegionFields,
    ...eventObjectFields,

    /** AS2 actor. Exactly one per event, which is what makes "not your own" a single comparison. */
    actorFk: integer('actor_fk')
      .notNull()
      .references((): AnyColumn => users.id),
    /**
     * How many live comments hang under this card, top level and replies alike.
     *
     * Denormalised because the feed needs the number without the text: ZQL has no aggregate, so
     * the only other way to say "3 comments" is to sync all three bodies to every reader of the
     * window, which is what the thread is lazy-loaded to avoid.
     *
     * Maintained by `sync_event_comment_count`, a trigger on `reactions`, rather than by the two
     * handlers that write comments. They run under RLS on the caller's connection and `events`
     * has no UPDATE policy for a member, so a counter write there would match no rows and report
     * nothing; and the `region.delete` moderator policy can clear a comment without passing
     * through either handler.
     */
    commentCount: integer('comment_count').notNull().default(0),
    /** What the sentence needs and the object cannot answer, e.g. the role a change assigned. */
    metadata: text('metadata'),
    /**
     * Whether enough of this event's community turned up for the card to say so.
     *
     * Denormalised for the same reason `comment_count` is, and more so: reactions sync as related
     * rows, so an event with 200 of them ships 200 rows to every reader of the feed. A client-side
     * threshold would need every one; a stored flag needs none.
     *
     * Maintained by `sync_event_promoted`, a trigger on `reactions`, because a handler runs under
     * RLS on the caller's connection and `events` has no UPDATE policy for a member, so a write
     * there would match no rows and report nothing.
     *
     * Sticky by construction: the trigger only ever sets it true. Reactions can be taken back, and
     * a banner that appears and then vanishes is worse than one that lingers; it also cannot flap
     * for an event sitting on the threshold.
     */
    promoted: boolean('promoted').notNull().default(false),
    verb: text('verb', { enum: eventVerb }).notNull(),
  },
  (table) => [
    // What the feed actually reads: the reader's regions, newest first. Two single-column
    // indexes cannot serve that as an index scan, so it degrades to a bitmap scan plus a sort on
    // the table that will grow fastest here.
    index('events_region_fk_created_at_idx').on(table.regionFk, table.createdAt.desc()),
    index('events_actor_fk_idx').on(table.actorFk),
    // Partial, because `events_one_object` guarantees five of these six are NULL in every row.
    // A full btree would store an entry per row in all six, roughly 6x the bytes for nothing:
    // the only query any of them serves is "the log for this entity", which never asks for NULL.
    index('events_area_fk_idx')
      .on(table.areaFk)
      .where(sql`area_fk is not null`),
    index('events_ascent_fk_idx')
      .on(table.ascentFk)
      .where(sql`ascent_fk is not null`),
    index('events_block_fk_idx')
      .on(table.blockFk)
      .where(sql`block_fk is not null`),
    index('events_file_fk_idx')
      .on(table.fileFk)
      .where(sql`file_fk is not null`),
    index('events_route_fk_idx')
      .on(table.routeFk)
      .where(sql`route_fk is not null`),
    index('events_subject_fk_idx')
      .on(table.subjectFk)
      .where(sql`subject_fk is not null`),

    // Exactly one object. An objectless event has nothing to render and nothing to react to, and
    // allowing it would reintroduce the "which of these is set" branching the keys exist to end.
    check('events_one_object', sql.raw(`num_nonnulls(${EVENT_OBJECT_COLUMNS}) = 1`)),

    // Ownership on INSERT too, not only on the edits. A region predicate alone would let any
    // member write an event carrying somebody else's `actor_fk`, and the feed would render
    // "Bob deleted Rampe" about somebody who did nothing. `activities` has that hole today; it
    // does not get carried forward.
    policy(
      `${REGION_PERMISSION_READ} can insert their own events`,
      getOwnRowPolicyConfig('insert', REGION_PERMISSION_READ, table.actorFk, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read events`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    // The fold merges a continuing call into an open event, which is an UPDATE. A table with RLS
    // on denies any command it has no policy for, so without this the fold silently loses writes.
    policy(
      `${REGION_PERMISSION_READ} can update their own events`,
      getOwnRowPolicyConfig('update', REGION_PERMISSION_READ, table.actorFk, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can delete their own events`,
      getOwnRowPolicyConfig('delete', REGION_PERMISSION_READ, table.actorFk, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_DELETE} can delete events`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_DELETE, table.regionFk),
    ),
  ],
).enableRLS()

export type Event = InferSelectModel<typeof events>
export type EventVerb = (typeof eventVerb)[number]
export type InsertEvent = InferInsertModel<typeof events>

export const eventsRelations = relations(events, ({ many, one }) => ({
  actor: one(users, { fields: [events.actorFk], references: [users.id], relationName: 'event-actor' }),
  area: one(areas, { fields: [events.areaFk], references: [areas.id] }),
  ascent: one(ascents, { fields: [events.ascentFk], references: [ascents.id] }),
  block: one(blocks, { fields: [events.blockFk], references: [blocks.id] }),
  changes: many(changes),
  file: one(files, { fields: [events.fileFk], references: [files.id] }),
  reactions: many(reactions),
  region: one(regions, { fields: [events.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [events.routeFk], references: [routes.id] }),
  subject: one(users, { fields: [events.subjectFk], references: [users.id], relationName: 'event-subject' }),
}))

/**
 * One changed column under an event. This is `activities` with everything that was really about
 * the action lifted up to the event, where exactly one copy of it lives.
 *
 * Only exists for `verb: 'update'`. Roughly 90% of today's activity rows carry no diff at all and
 * become events with no change row under them, which is the whole diagnosis in one line.
 *
 * The object columns are `at most one` here rather than exactly one: null means "the event's own
 * object", which is the common path. They are set only when a single call moved several rows (a
 * block reorder), and that is what lets a block's log find a reorder whose object is its area.
 */
export const changes = table(
  'changes',
  {
    ...baseFields,
    ...baseRegionFields,
    ...eventObjectFields,

    columnName: text('column_name').notNull(),
    eventFk: integer('event_fk')
      .notNull()
      .references((): AnyColumn => events.id, { onDelete: 'cascade' }),
    newValue: text('new_value'),
    oldValue: text('old_value'),
  },
  (table) => [
    index('changes_region_fk_idx').on(table.regionFk),
    // One row per column per event is the fold's contract, so it is a constraint rather than a
    // convention. It also lets the fold be a single `ON CONFLICT (event_fk, column_name) DO
    // UPDATE` instead of the read-then-write the activities log used to do, which is what let a
    // double-submit produce two contradictory `grade` lines on one card.
    uniqueIndex('changes_event_fk_column_name_idx').on(table.eventFk, table.columnName),
    // Partial for the same reason as `events`: at most one of the six is ever set, and the only
    // query that reads them is a scoped log asking for one entity.
    index('changes_area_fk_idx')
      .on(table.areaFk)
      .where(sql`area_fk is not null`),
    index('changes_ascent_fk_idx')
      .on(table.ascentFk)
      .where(sql`ascent_fk is not null`),
    index('changes_block_fk_idx')
      .on(table.blockFk)
      .where(sql`block_fk is not null`),
    index('changes_file_fk_idx')
      .on(table.fileFk)
      .where(sql`file_fk is not null`),
    index('changes_route_fk_idx')
      .on(table.routeFk)
      .where(sql`route_fk is not null`),
    index('changes_subject_fk_idx')
      .on(table.subjectFk)
      .where(sql`subject_fk is not null`),

    check('changes_at_most_one_object', sql.raw(`num_nonnulls(${EVENT_OBJECT_COLUMNS}) <= 1`)),

    // Ownership is read through `event_fk`, never off the row: a change has no author of its
    // own. A plain region predicate here would let any member rewrite anybody's diff, or forge
    // one onto somebody else's event.
    policy(
      `${REGION_PERMISSION_READ} can insert changes on their own events`,
      getOwnEventChildPolicyConfig('insert', REGION_PERMISSION_READ, table.eventFk, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read changes`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    // The column-local half of the fold: a second edit of the same column overwrites `new_value`
    // on the row the first one wrote, and an edit back to where it started deletes the row.
    policy(
      `${REGION_PERMISSION_READ} can update changes on their own events`,
      getOwnEventChildPolicyConfig('update', REGION_PERMISSION_READ, table.eventFk, table.regionFk),
    ),
    policy(
      `${REGION_PERMISSION_READ} can delete changes on their own events`,
      getOwnEventChildPolicyConfig('delete', REGION_PERMISSION_READ, table.eventFk, table.regionFk),
    ),
    // Moderation deletes the EVENT, and the cascade takes its changes with it without consulting
    // RLS on this table, so there is deliberately no `region.delete` policy here to match the one
    // on `events`. A moderator who could delete change rows on their own could leave an event
    // claiming an edit with no diff under it.
  ],
).enableRLS()

export type Change = InferSelectModel<typeof changes>
export type InsertChange = InferInsertModel<typeof changes>

export const changesRelations = relations(changes, ({ one }) => ({
  area: one(areas, { fields: [changes.areaFk], references: [areas.id] }),
  ascent: one(ascents, { fields: [changes.ascentFk], references: [ascents.id] }),
  block: one(blocks, { fields: [changes.blockFk], references: [blocks.id] }),
  event: one(events, { fields: [changes.eventFk], references: [events.id] }),
  file: one(files, { fields: [changes.fileFk], references: [files.id] }),
  region: one(regions, { fields: [changes.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [changes.routeFk], references: [routes.id] }),
  subject: one(users, { fields: [changes.subjectFk], references: [users.id] }),
}))

/**
 * What people said back: emoji and comments in one table, discriminated by `type`.
 *
 * Both are a person, a target and a string, so `type` is the only thing that differs and therefore
 * the only discriminator. Sharing the table is what buys reactions-on-comments for one nullable
 * self-reference instead of a second target column on every table that points here.
 *
 * NOT rows in `events`, deliberately. Reactions outnumber events by a large multiple, they toggle
 * all day where the log is append-only, they are written by the client directly where events are
 * written only by mutation handlers, and one-per-person is a clean index only on its own table.
 * AS2 models a Like as an activity, but AS2 is a wire format: Mastodon speaks it and still keeps
 * `favourites` apart from `statuses`, and Stream spells comments as reactions with a kind.
 *
 * The name is wider than the UI word on purpose, see CONTEXT.md: here "reaction" covers comments,
 * in the interface "Reactions" means only the emoji half.
 */
export const reactionType: ['emoji', 'comment'] = ['emoji', 'comment']

export const reactions = table(
  'reactions',
  {
    ...baseFields,
    ...baseRegionFields,
    ...softDeleteFields,

    /** What the own-entry policy compares. `user_fk` is what the app joins on, as `favorites` does. */
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    /** The emoji, or the comment text. One column because both payloads are strings; a future type
     *  carrying a number would want its own rather than a stringified one. */
    body: text('body').notNull(),
    /** The card this hangs under, at any depth. Stays set on a reply to a reply, so the whole
     *  subtree under a card is one query rather than a recursive walk. */
    eventFk: integer('event_fk')
      .notNull()
      .references((): AnyColumn => events.id, { onDelete: 'cascade' }),
    /** A reply, or a reaction on a comment. Null for anything hanging directly off the event. */
    parentFk: integer('parent_fk').references((): AnyColumn => reactions.id, { onDelete: 'cascade' }),
    type: text('type', { enum: reactionType }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('reactions_event_fk_idx').on(table.eventFk),
    index('reactions_parent_fk_idx').on(table.parentFk),
    index('reactions_region_fk_idx').on(table.regionFk),
    index('reactions_user_fk_idx').on(table.userFk),

    // One emoji per person per target; comments are unlimited. Through `coalesce` rather than
    // `NULLS NOT DISTINCT` because drizzle's index builder cannot express the latter, and because
    // this works on any Postgres version. Ids are serial from 1, so 0 is a safe stand-in for "no
    // parent". Without the coalesce every null `parent_fk` counts as distinct and the constraint
    // silently stops deduping the top level, which is the only level that has any today.
    // `deleted_at IS NULL` is load-bearing, not tidiness: this table soft-deletes, so a removed
    // reaction stays. Without it, un-reacting and reacting again with the same emoji hits 23505
    // against the row the first tap left behind.
    uniqueIndex('reactions_one_emoji_idx')
      .on(table.eventFk, sql`coalesce(${table.parentFk}, 0)`, table.userFk)
      .where(sql`${table.type} = 'emoji' and ${table.deletedAt} is null`),

    // The emoji half is only a length guard: Postgres regex has no `\p{RGI_Emoji}` (it is a
    // property of strings, JS `v` flag only), so single-emoji validation stays in the handler.
    check(
      'reactions_body_fits_type',
      // Both halves need a lower bound. `<= 16` alone accepts '', which is NOT NULL but empty:
      // it takes the one-emoji-per-person slot and renders as a chip nobody can see to remove.
      sql.raw(
        `(type = 'comment' AND length(body) BETWEEN 1 AND 5000) OR (type = 'emoji' AND length(body) BETWEEN 1 AND 16)`,
      ),
    ),

    // Not `getOwnEntryPolicyConfig`: that only compares `auth.uid()` to `auth_user_fk`, which
    // says who is asking but not who the row is attributed to, and carries no region predicate
    // at all. Every relation and the whole Zero schema joins on `user_fk`, so unbound it lets a
    // caller post under another member's name, into a region they are not in, on an event they
    // cannot read.
    policy(
      `users can insert own reactions`,
      getOwnReactionPolicyConfig('insert', REGION_PERMISSION_READ, {
        authUserFk: table.authUserFk,
        eventFk: table.eventFk,
        regionFk: table.regionFk,
        userFk: table.userFk,
      }),
    ),
    policy(
      `users can update own reactions`,
      getOwnReactionPolicyConfig('update', REGION_PERMISSION_READ, {
        authUserFk: table.authUserFk,
        eventFk: table.eventFk,
        regionFk: table.regionFk,
        userFk: table.userFk,
      }),
    ),
    // Same three predicates as insert and update, not the bare own-entry helper: somebody who
    // left a region, or whose membership was deactivated, must not still be able to delete rows
    // in it. `getOwnEntryPolicyConfig` carries no region check at all, which is the reason the
    // comment above rejects it.
    policy(
      `users can delete own reactions`,
      getOwnReactionPolicyConfig('delete', REGION_PERMISSION_READ, {
        authUserFk: table.authUserFk,
        eventFk: table.eventFk,
        regionFk: table.regionFk,
        userFk: table.userFk,
      }),
    ),
    policy(
      `${REGION_PERMISSION_READ} can read reactions`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    // Recourse. 👎 is in the quick row, so a region moderator can remove one. No UI ships with
    // this; the policy exists so the lever is there when it is first needed.
    policy(
      `${REGION_PERMISSION_DELETE} can delete reactions`,
      getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_DELETE, table.regionFk),
    ),
  ],
).enableRLS()

export type InsertReaction = InferInsertModel<typeof reactions>
export type Reaction = InferSelectModel<typeof reactions>
export type ReactionType = (typeof reactionType)[number]

export const reactionsRelations = relations(reactions, ({ many, one }) => ({
  children: many(reactions, { relationName: 'reaction-parent' }),
  event: one(events, { fields: [reactions.eventFk], references: [events.id] }),
  parent: one(reactions, {
    fields: [reactions.parentFk],
    references: [reactions.id],
    relationName: 'reaction-parent',
  }),
  region: one(regions, { fields: [reactions.regionFk], references: [regions.id] }),
  user: one(users, { fields: [reactions.userFk], references: [users.id] }),
}))

/**
 * What a directed notification is about: one value per sentence the inbox can write. Splitting
 * "somebody touched your ascent" into edited and deleted, and membership into a role change and
 * an accepted invitation, is what lets each row be a specific sentence rather than a category.
 *
 * A `text` column with a TypeScript-side enum and no CHECK, so adding a value is a `schema.ts`
 * edit plus `generate:zero`, with no DDL at all. That is why the media case is absent: attaching
 * a photo to somebody else's ascent is refused outright by `resolveAttachRegion`, so a source
 * type for it could never fire. Add it back here the day that gate relaxes.
 *
 * `membership_removed` and `invitation_received` are a SEND QUEUE, not inbox entries, and this is
 * the one place that says so in full. Both are aimed at somebody outside the region the row names
 * - a member who was just removed, an invitee who has not joined - so there is no inbox they could
 * be shown in. `listNotifications` excludes both outright and `unreadCounts` does not count them;
 * that exclusion is the guarantee, NOT the region gate, which stops being true the moment somebody
 * accepts or is added back. Living in this table anyway is what buys them the debounce, the unique
 * index, `pushed_at` and a delete as the undo hook, with no second table to keep in step.
 *
 * Written by `notifyOutOfBand`, drained by `/api/tasks/notifications`.
 */
export const notificationSourceType: [
  'mention',
  'ascent_edited',
  'ascent_deleted',
  'role_changed',
  'invite_accepted',
  'membership_removed',
  'invitation_received',
  'reaction',
  'comment',
  'comment_reply',
  'comment_reaction',
] = [
  'mention',
  'ascent_edited',
  'ascent_deleted',
  'role_changed',
  'invite_accepted',
  'membership_removed',
  'invitation_received',
  'reaction',
  'comment',
  'comment_reply',
  'comment_reaction',
]

/**
 * Things aimed at one person: a mention, somebody editing your ascent, a role change.
 *
 * Deliberately NOT where region activity lives. Broadcast events are already on screen in the
 * feed, already grouped and already hydrated, so a row per recipient would store what the feed
 * holds N times over only to render it a second time. What the badge counts is what was aimed at
 * the reader; a badge dominated by guidebook edits trains people to ignore it.
 *
 * Only the server writes here (the fan-out runs on the privileged handle), so there is no insert
 * or delete policy: an own-rows insert policy would by definition reject a row the actor is
 * writing for somebody else, and a wider one would let anybody with a JWT post into a stranger's
 * inbox.
 */
export const notifications = table(
  'notifications',
  {
    ...baseFields,
    ...baseRegionFields,

    /** Who caused it. Never the recipient: self-authored events are filtered out at fan-out. */
    actorFk: integer('actor_fk')
      .notNull()
      .references((): AnyColumn => users.id),
    // The recipient again, as auth sees them. `user_fk` is what the app joins on; this is what
    // the own-rows policy compares, exactly as `favorites` carries both.
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    /**
     * What the row is about, in the same six columns an event uses, so the inbox can nest the
     * object the way the feed does instead of joining a polymorphic pair in memory.
     *
     * At most one, not exactly one: a row whose object was already gone when the backfill ran
     * carries none, keeps its sentence and simply offers no entity row underneath it, which is
     * what the three source types that never had one already look like.
     *
     * `file_fk` exists to keep the shape identical to `events`, and `objectOf` with it. Nothing
     * writes it: a reaction on an upload notifies about the thing the photos landed on.
     */
    ...eventObjectFields,
    /**
     * Which card, for the two source types that are about one: a reaction and a comment.
     *
     * The object columns stay set beside it, and are still what the inbox row links to and
     * renders. This says WHICH event was reacted to, so two reactions on two events about the same
     * route are two rows rather than one collapsing into the other through
     * `notifications_source_idx`.
     *
     * Cascades. A hard delete inside the grace window takes the event away, and an inbox row about
     * a card that no longer exists is a dead end.
     */
    eventFk: integer('event_fk').references((): AnyColumn => events.id, { onDelete: 'cascade' }),
    /** Whatever the sentence needs that the entity can no longer answer, e.g. the route name of
     *  a deleted ascent. */
    metadata: text('metadata'),
    /** null = never delivered by push. Set by the cron once it has gone out. */
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    /**
     * Where inside the card, for a comment: the row it is about, so the inbox can say which one
     * and a future permalink can scroll to it. Null on a reaction, whose row IS the event.
     *
     * Cascades with the comment for the same reason `event_fk` does.
     */
    reactionFk: integer('reaction_fk').references((): AnyColumn => reactions.id, { onDelete: 'cascade' }),
    /** null = unread. */
    readAt: timestamp('read_at', { withTimezone: true }),
    sourceType: text('source_type', { enum: notificationSourceType }).notNull(),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    // What makes a re-save idempotent. Opening a description in the markdown editor and saving it
    // again re-emits the same `!users:N!` refs; without this that re-notifies everyone mentioned,
    // every time.
    // ponytail: it also collapses a second event of the same kind on the same entity by the same
    // actor into the first (two photos on your ascent are one notification, which is what you
    // want; a role set back and forth is one, which is the price). Upgrade = a nonce column if
    // anybody misses the second one.
    //
    // The card is in the key beside the object, which is what keeps two reactions on two events
    // about one route two rows rather than one; on a row that is not about a card, `event_fk` is
    // null and the object is what separates them.
    //
    // NULLS NOT DISTINCT is load-bearing, and it is why this is one constraint rather than the two
    // partial indexes it replaced: five of the six object columns are null on every row, and the
    // default would make every row unique against every other and dedupe nothing. It also has to
    // be a CONSTRAINT rather than an index, because a partial unique index cannot say it.
    //
    // `region_fk` is in the key, and it is doing real work for exactly the source types whose
    // object does not imply a region. A mention on a route names a route, and a route lives in
    // one region, so for those this column is functionally determined and changes nothing. A
    // membership sentence names a PERSON, and a person holds a membership per region: without
    // this, changing Ada's role in two regions, or removing her from two, is one row - and the
    // second one either vanishes or overwrites the first's region and announces the wrong place.
    unique('notifications_source_idx')
      .on(
        table.userFk,
        table.sourceType,
        table.actorFk,
        table.regionFk,
        table.eventFk,
        table.areaFk,
        table.ascentFk,
        table.blockFk,
        table.fileFk,
        table.routeFk,
        table.subjectFk,
      )
      .nullsNotDistinct(),
    check('notifications_at_most_one_object', sql.raw(`num_nonnulls(${EVENT_OBJECT_COLUMNS}) <= 1`)),
    index('notifications_user_fk_read_at_idx').on(table.userFk, table.readAt),
    index('notifications_region_fk_idx').on(table.regionFk),
    // The cron's only query over this table, and it runs every five minutes. Partial on BOTH
    // predicates, so it stays the size of the undelivered-and-unread backlog rather than of the
    // whole inbox, and keyed on `created_at` because that is what the debounce then orders and
    // filters by. Indexing `pushed_at` itself would index a column that is null in every row the
    // index contains.
    index('notifications_pushed_at_idx')
      .on(table.createdAt)
      .where(sql`pushed_at is null and read_at is null`),

    // Own rows AND a region the reader can still open, which is what `activities` requires of the
    // events these are about. Without the second half a member who left a region keeps reading
    // its notifications straight off PostgREST, where none of the client's region filtering
    // applies.
    policy(
      `users can read own notifications`,
      getPolicyConfig(
        'select',
        sql.raw(
          `(SELECT auth.uid()) = auth_user_fk AND (SELECT authorize_in_region('${REGION_PERMISSION_READ}', region_fk))`,
        ),
      ),
    ),
    // Own rows only. WHICH COLUMN is not something a policy can say, so the migration additionally
    // narrows the `authenticated` grant to `read_at`: without that, `PATCH /rest/v1/notifications`
    // with a plain user JWT rewrites the source type, the actor and the metadata of the reader's
    // own inbox rows.
    policy(`users can update own notifications`, getOwnEntryPolicyConfig('update', table.authUserFk)),
  ],
).enableRLS()

export type InsertNotification = InferInsertModel<typeof notifications>
export type Notification = InferSelectModel<typeof notifications>

export const notificationsRelations = relations(notifications, ({ one }) => ({
  actor: one(users, { fields: [notifications.actorFk], references: [users.id], relationName: 'notification-actor' }),
  // The same six the event carries, named the same way, so the inbox nests its object through the
  // relation the feed already reads rather than joining a polymorphic pair in memory.
  area: one(areas, { fields: [notifications.areaFk], references: [areas.id] }),
  ascent: one(ascents, { fields: [notifications.ascentFk], references: [ascents.id] }),
  authUser: one(authUsers, { fields: [notifications.authUserFk], references: [authUsers.id] }),
  block: one(blocks, { fields: [notifications.blockFk], references: [blocks.id] }),
  event: one(events, { fields: [notifications.eventFk], references: [events.id] }),
  file: one(files, { fields: [notifications.fileFk], references: [files.id] }),
  reaction: one(reactions, { fields: [notifications.reactionFk], references: [reactions.id] }),
  region: one(regions, { fields: [notifications.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [notifications.routeFk], references: [routes.id] }),
  subject: one(users, {
    fields: [notifications.subjectFk],
    references: [users.id],
    relationName: 'notification-subject',
  }),
  user: one(users, { fields: [notifications.userFk], references: [users.id], relationName: 'notification-user' }),
}))

const FAVORITE_OBJECT_COLUMNS = 'area_fk, block_fk, route_fk'

/**
 * A saved area, block or route.
 *
 * Fixed foreign keys rather than the `entity_type` + `entity_id` pair this used to carry, the same
 * move `events` made. A text id cannot be joined or cascaded, so a favorite outlived the route it
 * pointed at, and no index could stop the same route being saved twice: both of those are the
 * database's job, and neither is expressible against a pair of columns it cannot constrain.
 *
 * The client keeps speaking `entityType`/`entityId`: the mapper reads whichever key is set. That
 * vocabulary is what `SaveButton` and the profile list are written in, and none of it is what the
 * database needed fixing for.
 */
export const favorites = table(
  'favorites',
  {
    ...baseFields,
    ...baseRegionFields,

    areaFk: integer('area_fk').references((): AnyColumn => areas.id, { onDelete: 'cascade' }),
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id),
    blockFk: integer('block_fk').references((): AnyColumn => blocks.id, { onDelete: 'cascade' }),

    routeFk: integer('route_fk').references((): AnyColumn => routes.id, { onDelete: 'cascade' }),
    userFk: integer('user_fk')
      .notNull()
      .references((): AnyColumn => users.id),
  },
  (table) => [
    index('favorites_created_at_idx').on(table.createdAt),
    // Partial, because `favorites_one_object` guarantees two of these three are NULL in every row,
    // and the only query any of them serves ("who saved this block") never asks for NULL.
    index('favorites_area_fk_idx')
      .on(table.areaFk)
      .where(sql`area_fk is not null`),
    index('favorites_block_fk_idx')
      .on(table.blockFk)
      .where(sql`block_fk is not null`),
    index('favorites_route_fk_idx')
      .on(table.routeFk)
      .where(sql`route_fk is not null`),
    index('favorites_user_fk_idx').on(table.userFk),
    // Saving something twice is not a thing a person can mean, and `toggleFavorite` reads before it
    // writes, so two devices tapping Save at the same moment used to leave two rows: the count said
    // two, and the next tap deleted one of them and left the button stuck on saved. Partial so each
    // index only covers the rows that actually carry that key.
    uniqueIndex('favorites_user_area_idx')
      .on(table.userFk, table.areaFk)
      .where(sql`area_fk is not null`),
    uniqueIndex('favorites_user_block_idx')
      .on(table.userFk, table.blockFk)
      .where(sql`block_fk is not null`),
    uniqueIndex('favorites_user_route_idx')
      .on(table.userFk, table.routeFk)
      .where(sql`route_fk is not null`),

    // Exactly one object, as `events` requires of its six. A favorite of nothing has nothing to
    // render and nothing to open; a favorite of two things is two favorites.
    check('favorites_one_object', sql.raw(`num_nonnulls(${FAVORITE_OBJECT_COLUMNS}) = 1`)),

    policy(`users can insert own favorites`, getOwnEntryPolicyConfig('insert', table.authUserFk)),
    policy(
      `${REGION_PERMISSION_READ} can read favorites`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ, table.regionFk),
    ),
    // No update policy: saving is an insert and unsaving is a delete, so nothing in the app has ever
    // updated a favorite. What the policy did do was let a caller take their own row and rewrite its
    // `user_fk` to somebody else, which is the same forgery the insert policy refuses.
    policy(`users can delete own favorites`, getOwnEntryPolicyConfig('delete', table.authUserFk)),
  ],
).enableRLS()

export type Favorite = InferSelectModel<typeof favorites>
export type InsertFavorite = InferInsertModel<typeof favorites>

export const favoritesRelations = relations(favorites, ({ one }) => ({
  area: one(areas, { fields: [favorites.areaFk], references: [areas.id] }),
  authUser: one(authUsers, { fields: [favorites.authUserFk], references: [authUsers.id] }),
  block: one(blocks, { fields: [favorites.blockFk], references: [blocks.id] }),
  region: one(regions, { fields: [favorites.regionFk], references: [regions.id] }),
  route: one(routes, { fields: [favorites.routeFk], references: [routes.id] }),
  user: one(users, { fields: [favorites.userFk], references: [users.id] }),
}))

// Named for its original client-only purpose; it holds server errors too. Left as
// is because the whole table is disposable the day a real error tracker shows up.
export const clientErrorLogs = table('client_error_logs', {
  ...baseFields,
  createdBy: integer('created_by').references((): AnyColumn => users.id),
  error: text(),
  navigator: jsonb().$type<z.infer<ReturnType<typeof z.json>>>(),
  pathname: text(),
  source: text().$type<'client' | 'server'>().notNull().default('client'),
}).enableRLS()

export type ClientErrorLogs = InferSelectModel<typeof clientErrorLogs>
export type InsertClientErrorLog = InferInsertModel<typeof clientErrorLogs>
