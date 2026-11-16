import { env } from '$env/dynamic/private'
import { verifyAppleJwt } from '$lib/auth/app/appleToken.server'
import { APP_BUNDLE_ID } from '$lib/auth/app/constants'
import { recentAppleEvent, recordAuthEvent } from '$lib/auth/events.server'
import { noticeAppleRemoved } from '$lib/auth/mail.server'
import { addressHash } from '$lib/auth/mailForwarding.server'
import { accountMethods, signInMethods } from '$lib/auth/methods.server'
import { pinnedTx, type Tx } from '$lib/db/pinned.server'
import * as z from '$lib/forms/zod'
import { sql } from 'drizzle-orm'
import { decodeJwt, type JWTPayload } from 'jose'

/** Apple's documented `events` claim: every type carries these. */
const appleEvent = z.object({ event_time: z.number(), sub: z.string(), type: z.string() })

const FORWARDING = ['email-disabled', 'email-enabled'] as const
const REVOCATION = ['account-deleted', 'consent-revoked'] as const

/** A forwarding notification also names the address, and whether it is the private one Apple made. */
const forwardingEvent = z.object({
  email: z.string(),
  event_time: z.number(),
  is_private_email: z.optional(z.enum(['true', 'false'])),
  sub: z.string(),
  type: z.enum(FORWARDING),
})

type ForwardingEvent = z.infer<typeof forwardingEvent>

/** Apple's Sign in with Apple server-to-server notification, `{ payload: <JWS> }`; the status to answer with. */
export async function receiveAppleNotification(body: unknown): Promise<number> {
  const payload = (body as null | { payload?: unknown })?.payload
  if (typeof payload !== 'string') return 400
  const verified = await verifyNotification(payload)
  if (typeof verified === 'number') return verified

  const events = parseEvents(verified.events)
  const envelope = appleEvent.safeParse(events)
  const at = envelope.success ? eventSeconds(envelope.data.event_time, verified.iat as number) : null
  if (!envelope.success || at == null) return invalid()
  const { type } = envelope.data
  if ((REVOCATION as readonly string[]).includes(type)) return revocation({ ...envelope.data, event_time: at })
  if (!(FORWARDING as readonly string[]).includes(type)) {
    await recordAuthEvent('apple_notification', { detail: { outcome: 'ignored', type } })
    return 200
  }
  const event = forwardingEvent.safeParse(events)
  if (!event.success) return invalid()
  const { authUserId, outcome } = await onceMoreOnDeadlock(() => applyForwarding({ ...event.data, event_time: at }))
  await recordAuthEvent('apple_notification', { authUserId, detail: { outcome, type } })
  return 200
}

/** A notification Apple signed for grnyte that grnyte cannot use: recorded, so a spike alerts. */
async function invalid(reason: 'claims' | 'events' = 'events'): Promise<number> {
  await recordAuthEvent('apple_notification_invalid', { detail: { reason } })
  return 400
}

async function revocation(event: z.infer<typeof appleEvent>): Promise<number> {
  const own = await ownRevocation(event.sub)
  if (own != null) {
    await recordAuthEvent('apple_notification', {
      authUserId: own,
      detail: { outcome: 'own_revocation', type: event.type },
    })
    return 200
  }
  const { account, authUserId, outcome } = await onceMoreOnDeadlock(() => applyRevocation(event))
  if (outcome === 'removed' && account != null) await noticeAppleRemoved(account)
  await recordAuthEvent('apple_notification', {
    authUserId: account?.id ?? authUserId,
    detail: { outcome, type: event.type },
  })
  return 200
}

/** The verified claims, or the status to refuse with. */
async function verifyNotification(payload: string): Promise<JWTPayload | number> {
  const audiences = [env.APPLE_SERVICES_ID ?? '', APP_BUNDLE_ID]
  const verdict = await verifyAppleJwt(payload, {
    audience: audiences,
    // Apple documents no retry; a day covers its delivery delay, and the event-time guards cover replays inside it.
    clockTolerance: '5m',
    maxTokenAge: '1d',
    requiredClaims: ['iat', 'events'],
  })
  if (verdict.ok) return verdict.payload
  if (verdict.reason === 'unavailable') return 503
  // Only a notification Apple signed for grnyte counts: anyone can post another app's, or their own ID token.
  if (verdict.signed && isForGrnyte(decodeJwt(payload), audiences)) return invalid('claims')
  console.warn('[apple-notification] refused a token that is not a notification for grnyte')
  return 400
}

const isForGrnyte = (claims: JWTPayload, audiences: string[]) =>
  claims.events != null && [claims.aud].flat().some((aud) => aud != null && audiences.includes(aud))

type Outcome = 'applied' | 'ignored' | 'no_account' | 'stale'

/** Matches by Apple's `sub`, locks the account, and records the forwarding state unless a later one is stored. */
async function applyForwarding(event: ForwardingEvent): Promise<{ authUserId?: string; outcome: Outcome }> {
  return pinnedTx(async (tx) => {
    // By Apple's user, else (Apple removed, address kept) by the address the event names.
    const [match] = await tx.execute<{ user_id: string }>(sql`
      select user_id from (
        select user_id, 1 as rank from auth.identities where provider = 'apple' and provider_id = ${event.sub}
        union all
        select id, 2 from auth.users where lower(email) = lower(${event.email})
      ) found order by rank limit 1`)
    if (match == null) return { outcome: 'no_account' }
    // Apple's forwarding switch governs only the private address it made, never a real one shared with it.
    if (event.is_private_email !== 'true') return { authUserId: match.user_id, outcome: 'ignored' }
    await tx.execute(sql`select 1 from auth.users where id = ${match.user_id} for update`)
    const written = await storeForwarding(
      tx,
      match.user_id,
      event.email,
      event.type === 'email-enabled',
      event.event_time,
    )
    return { authUserId: match.user_id, outcome: written ? 'applied' : 'stale' }
  })
}

/**
 * Apple says the person's credentials are invalid: sign every device out, and remove Apple where another way in
 * stays. One locked transaction, so a concurrent removal on another device cannot slip between check and delete.
 */
async function applyRevocation(event: z.infer<typeof appleEvent>): Promise<{
  account?: { email: string; id: string }
  authUserId?: string
  outcome: 'kept_only_method' | 'no_account' | 'removed' | 'stale'
}> {
  return pinnedTx(async (tx) => {
    const match = await lockedMatch(tx, event)
    if (match == null) return { outcome: 'no_account' }
    if (match.since) return { authUserId: match.user_id, outcome: 'stale' }
    const account = { email: match.address, id: match.user_id }
    const removable = accountMethods(await signInMethods(account.id, tx)).providers.apple.canUnlink
    let removed = false
    if (removable) {
      await tx.execute(sql`select set_config('grnyte.apple_identity_removal', ${`${account.id}:${event.sub}`}, true)`)
      const deleted = await tx.execute(sql`
        delete from auth.identities where user_id = ${account.id} and provider = 'apple' and provider_id = ${event.sub}
          and created_at <= to_timestamp(${event.event_time})
        returning 1`)
      removed = deleted.length > 0
    }
    // A deleted Apple ID also ends forwarding; only for the private address Apple made, never a real one.
    if (event.type === 'account-deleted' && match.private && match.email != null) {
      await storeForwarding(tx, account.id, match.email, false, event.event_time)
    }
    // Only devices signed in before the event: a late delivery never signs out a newer sign-in.
    await tx.execute(sql`
      delete from auth.sessions where user_id = ${account.id} and created_at <= to_timestamp(${event.event_time})`)
    return { account, outcome: removed ? 'removed' : 'kept_only_method' }
  })
}

/**
 * `event_time` in seconds, or null. Apple sends milliseconds (seen live 2026-11-16) though its docs read as seconds;
 * the value must sit near the issue time, which tells the units apart: one value never fits the window in both.
 */
function eventSeconds(eventTime: number, iat: number): null | number {
  const near = (seconds: number) => seconds >= iat - 24 * 60 * 60 && seconds <= iat + 5 * 60
  if (near(eventTime)) return eventTime
  return near(eventTime / 1000) ? eventTime / 1000 : null
}

/** Finds the account by Apple's user, locks it, then reads the identity again: a sign-in can commit in between. */
async function lockedMatch(tx: Tx, event: z.infer<typeof appleEvent>) {
  const [found] = await tx.execute<{ user_id: string }>(sql`
    select user_id from auth.identities where provider = 'apple' and provider_id = ${event.sub}`)
  if (found == null) return undefined
  const [user] = await tx.execute<{ email: string }>(sql`
    select email from auth.users where id = ${found.user_id} for update`)
  if (user == null) return undefined
  // Linked or signed in with since the event: the person came back to Apple after it, so it no longer applies.
  const [match] = await tx.execute<{ email: null | string; private: boolean; since: boolean; user_id: string }>(sql`
    select user_id, greatest(created_at, last_sign_in_at) > to_timestamp(${event.event_time}) as since,
      identity_data->>'email' as email,
      coalesce(identity_data->>'is_private_email' = 'true', false)
        or lower(identity_data->>'email') like '%@privaterelay.appleid.com' as private
    from auth.identities where provider = 'apple' and provider_id = ${event.sub} and user_id = ${found.user_id}`)
  return match == null ? undefined : { ...match, address: user.email }
}

/** GoTrue locks the identity row before the account row, the handler the other way round; Postgres aborts one. */
async function onceMoreOnDeadlock<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (thrown) {
    const code =
      (thrown as { cause?: { code?: string }; code?: string }).cause?.code ?? (thrown as { code?: string }).code
    if (code !== '40P01') throw thrown
    return run()
  }
}

/** The account, when grnyte itself started revoking its Apple authorization in the last 10 minutes. */
async function ownRevocation(sub: string): Promise<string | undefined> {
  const [match] = await pinnedTx((tx) =>
    tx.execute<{ user_id: string }>(sql`
      select user_id from auth.identities where provider = 'apple' and provider_id = ${sub}`),
  )
  return match != null && (await recentAppleEvent(match.user_id, 'apple_revoke_started')) ? match.user_id : undefined
}

/** Apple's page shows an object; implementations report a JSON string. */
function parseEvents(events: unknown): unknown {
  if (typeof events !== 'string') return events
  try {
    return JSON.parse(events)
  } catch {
    return undefined
  }
}

/** Writes the forwarding state unless a later event is stored; true when it wrote. */
async function storeForwarding(
  tx: Tx,
  authUserId: string,
  email: string,
  forwarding: boolean,
  eventTime: number,
): Promise<boolean> {
  const written = await tx.execute(sql`
    insert into public.apple_mail_forwarding (auth_user_fk, address_hash, forwarding, event_at)
    values (${authUserId}, ${addressHash(email)}, ${forwarding}, to_timestamp(${eventTime}))
    on conflict (auth_user_fk) do update
      set address_hash = excluded.address_hash, forwarding = excluded.forwarding, event_at = excluded.event_at
      where apple_mail_forwarding.event_at < excluded.event_at
    returning 1`)
  return written.length > 0
}
