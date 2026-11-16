import { signInMethods } from '$lib/auth/methods/methods.server'
import { spendGrant, type ReauthCaller } from '$lib/auth/reauth/reauth.server'
import { pinnedTx } from '$lib/db/pinned.server'
import * as schema from '$lib/db/schema'
import { notifications, regionMembers, regions } from '$lib/db/schema'
import { users, userSettings } from '$lib/db/schema'
import { ownershipHandedOver } from '$lib/email/account'
import { sendEmail } from '$lib/email/send.server'
import { formError } from '$lib/forms/schemas'
import { contactLocale } from '$lib/i18n/message'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { error } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { notify } from '../notification/notification.server'
import { HANDOVER_ROLE } from '../rolePermission/mapper'
import { assertBelowOwnedCap } from './create.server'
import { MAX_OWNED_REGIONS } from './dto'
import { lockRegionMembers, requireOwner } from './guards.server'

export type TransferResult = { kind: 'reauthRequired' } | { kind: 'transferred' }

type Db = PostgresJsDatabase<typeof schema>

// Privileged: the cap counts regions the recipient owns anywhere, beyond the caller's RLS. The
// refusals run under the lock before the grant is spent, so a refused handover keeps it.
export async function transferRegionOwnership(
  owner: { email: string; id: number },
  target: { regionFk: number; userFk: number },
  caller: ReauthCaller,
): Promise<TransferResult> {
  const handed = await pinnedTx(async (tx) => {
    // The lock `assertNotOwner` takes, so a demotion of the recipient cannot slip in between.
    await lockRegionMembers(tx, target.regionFk)
    const region = await assertCanHandOver(tx, owner.id, target)
    if (!(await spendGrant(tx, caller, 'region.transfer', `${target.regionFk}:${target.userFk}`))) return null
    const [recipient] = await tx.select({ name: users.username }).from(users).where(eq(users.id, target.userFk))
    const [settings] = await tx
      .select({ locale: userSettings.contactLocale })
      .from(userSettings)
      .where(eq(userSettings.userFk, owner.id))
    await tx.update(regions).set({ createdBy: target.userFk }).where(eq(regions.id, target.regionFk))
    // An unread role notice shares the new one's conflict key, which would drop it; owner implies admin.
    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.userFk, target.userFk),
          eq(notifications.regionFk, target.regionFk),
          eq(notifications.sourceType, 'role_changed'),
          isNull(notifications.readAt),
        ),
      )
    return { locale: contactLocale(settings?.locale), owner: recipient?.name ?? '', region: region.name }
  })
  if (handed == null) return { kind: 'reauthRequired' }

  const methods = await signInMethods(caller.authUserId)
  await sendEmail({
    ...ownershipHandedOver({ ...handed, methods }),
    locale: handed.locale,
    template: 'ownership-handed-over',
    to: owner.email,
  })

  // After the commit, like `updateRegionMemberRoleRow`'s: a lost notice must not read as a failed handover.
  await notify({
    actorFk: owner.id,
    metadata: HANDOVER_ROLE,
    object: { id: target.userFk, type: 'user' },
    regionFk: target.regionFk,
    sourceType: 'role_changed',
    userFks: [target.userFk],
  }).catch((cause) => logServerFailure('region.handover', stringifyError(cause)))

  return { kind: 'transferred' }
}

async function assertCanHandOver(tx: Db, ownerFk: number, { regionFk, userFk }: { regionFk: number; userFk: number }) {
  const region = await requireOwner(tx, regionFk, ownerFk)
  const recipient = await tx.query.regionMembers.findFirst({
    columns: { id: true },
    where: and(
      eq(regionMembers.regionFk, regionFk),
      eq(regionMembers.userFk, userFk),
      eq(regionMembers.role, 'region_admin'),
      eq(regionMembers.isActive, true),
    ),
  })
  if (userFk === ownerFk) {
    error(409, formError('region_cannotChangeOwnRole'))
  }
  if (recipient == null) {
    error(409, formError('region_handOverAdminOnly'))
  }
  await assertBelowOwnedCap(tx, userFk, formError('region_handOverCapReached', { count: MAX_OWNED_REGIONS }))
  return region
}
