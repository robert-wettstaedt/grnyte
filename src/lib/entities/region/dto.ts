import { assignableRoles, type AppRole, type AssignableRole, type Permission } from '$lib/entities/rolePermission/dto'
import { formError, nameSchema, stringToInt } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { locales } from '$lib/paraglide/runtime'
import { mapLayerSchema, type RegionSettings } from './settings'
import { tagNameSchema } from './tagVocabulary'

/** How many regions one account may found. Anyone may start a region (the `regions` insert policy
 *  is open to authenticated users), so this is what keeps that from being unbounded. Counted over
 *  `regions.created_by`, which does not shrink when the founder leaves. */
export const MAX_OWNED_REGIONS = 3

/** A region the signed-in user founded, for the create screen's cap state. */
export interface OwnedRegion {
  id: number
  name: string
}

/** A region's own record, as shown on its settings screen. */
export interface RegionDetail {
  createdAt: Date | undefined
  /** Username of whoever created the region. */
  createdBy: string | undefined
  maxMembers: number
  name: string
}

/** A pending invitation, as listed on a region's settings screen. Deliberately without
 *  the join `token`, see `listRegionInvitations`. */
export interface RegionInvitationItem {
  email: string
  id: number
  invitedBy: string | undefined
  /** When a send was last accepted. Older than `lastSentAt` means the latest attempt failed. */
  lastDeliveredAt: Date | undefined
  /** When the mail last went out, so the row can say "sent 5 minutes ago" and an admin can tell
   *  "give it a moment" from "resend it". */
  lastSentAt: Date | undefined
}

/** One row of a region's member list. */
export interface RegionMemberItem {
  id: number
  /** Username of whoever invited them, absent for the region's founder. */
  invitedBy: string | undefined
  role: AppRole
  userId: number
  username: string
}

/** An active region membership of the signed-in user, before permissions are resolved. */
export interface RegionMembership {
  /** Whether `settings.mapLayers` is every layer stored. Reading the rest is the point; writing
   *  the key back is not, because it would save the difference away. */
  layersComplete: boolean
  name: string
  regionFk: number
  role: AppRole
  settings: RegionSettings
  /** Whether the region row itself has arrived: a membership routinely lands before it. Until
   *  then `settings` is empty rather than the starting vocabulary, which the route picker would
   *  otherwise offer. Anything seeding a form from a membership checks this first. */
  synced: boolean
  /** The same for `settings.tags`, which doubles as the route-write allowlist. */
  tagsComplete: boolean
}

/**
 * How full a region is. `full` deliberately covers both "exactly at the limit" and
 * "over it": a region seeded before the limit existed reads the same as one that
 * recently filled up, and there is nothing different for the user to do about either.
 */
export type SeatState = 'full' | 'ok' | 'oneLeft'

/** A live invitation addressed to the signed-in user, as listed on their settings screen. The
 *  other half of {@link RegionInvitationItem}: same row, seen from the invitee's side, and
 *  likewise without the join `token`. */
export interface UserInvitationItem {
  id: number
  /** Username of whoever sent it. Absent only if the inviter's row is gone. */
  invitedBy: string | undefined
  regionName: string
}

/** A region membership enriched with the permissions its role grants. */
export interface UserRegion extends RegionMembership {
  permissions: Permission[]
}

export const assignableRoleSchema = z.enum(assignableRoles)

export const regionCreateSchema = z.object({ name: nameSchema })

export const regionActionSchema = z.object({ id: stringToInt, name: nameSchema })

export const regionMapLayersSchema = z.object({
  id: stringToInt,
  /** Fingerprint of the layers the form was seeded with, so a save proves what it replaces.
   *  Defaulted, so a tab loaded before this deployed lands on the stale refusal rather than
   *  an unrenderable invalid_type issue. */
  known: z._default(z.optional(z.string()), ''),
  mapLayers: z._default(z.optional(z.array(mapLayerSchema)), []),
})

export const regionTagSchema = z.object({ name: tagNameSchema, regionFk: z.number() })

export const renameRegionTagSchema = z.object({ from: z.string(), regionFk: z.number(), to: tagNameSchema })

export const removeRegionTagSchema = z.object({ name: z.string(), regionFk: z.number() })

/** `locale` is the sender's, the mail's fallback language: a mutator's request is zero-cache's. */
export const inviteMemberSchema = z.object({
  email: z.email({ error: formError('auth_emailInvalid') }),
  locale: z.optional(z.enum(locales)),
  regionFk: stringToInt,
})

export const invitationSchema = z.object({ invitationFk: z.number(), locale: z.optional(z.enum(locales)) })

export const memberSchema = z.object({ regionFk: z.number(), userFk: z.number() })

export const memberRoleSchema = z.object({ regionFk: z.number(), role: assignableRoleSchema, userFk: z.number() })

export const regionFkSchema = z.object({ regionFk: z.number() })

export interface RemovedMemberSnapshot {
  regionFk: number
  /** Not `AppRole`: undo may only put a member back on a role the app can assign in the first
   *  place, so `app_admin` cannot be smuggled in through the snapshot. */
  role: AssignableRole
  userFk: number
}

export interface RevokedInvitationSnapshot {
  invitationFk: number
}
