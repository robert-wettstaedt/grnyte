import { PUBLIC_ORIGIN } from '$env/static/public'
import type { ReauthAction } from '$lib/auth'
import { pinnedTx } from '$lib/db/pinned.server'
import { authEvents } from '$lib/db/serverOnly'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { m } from '$lib/paraglide/messages'
import { and, count, eq, gt, gte, sql } from 'drizzle-orm'

// `kind` is text, so later changes widen this union without a migration.
export type AuthEventKind =
  | 'account_deleted'
  | 'alert_sent'
  | 'apple_notification'
  | 'apple_notification_invalid'
  | 'apple_revoke_failed'
  | 'apple_revoke_skipped'
  | 'apple_revoke_started'
  | 'apple_revoked'
  | 'handoff_failed'
  | 'identity_linked'
  | 'identity_unlinked'
  | 'mail_quota'
  | 'oauth_iss_mismatch'
  | 'oauth_link_refused'
  | 'oauth_nonce_mismatch'
  | 'oauth_state_mismatch'
  | 'oauth_sub_mismatch'
  | 'reauth_failed'

/** More than this many events of one failure kind in an hour alerts the admins, once a day. */
const SPIKE = 20

/** The failure kinds a spike alerts on; a kind added later stays quiet until listed here. */
const FAILURES: ReadonlySet<AuthEventKind> = new Set([
  'apple_notification_invalid',
  'handoff_failed',
  'oauth_iss_mismatch',
  'oauth_link_refused',
  'oauth_nonce_mismatch',
  'oauth_state_mismatch',
  'oauth_sub_mismatch',
  'reauth_failed',
])

/** GoTrue's `over_email_send_rate_limit` on one of grnyte's sends: the same stable message as Resend's quota. */
export async function noteMailRefusal(error: { code?: string; name?: string }): Promise<void> {
  const name = error.code ?? error.name ?? 'unknown'
  await logServerFailure('email', `mail quota exhausted (${name})`)
  await recordAuthEvent('mail_quota', { detail: { name } })
}

/** Whether the account has a `kind` event in the last 10 minutes, for exactly this action and target when given. */
export async function recentAppleEvent(
  authUserId: string,
  kind: AuthEventKind,
  filter?: { action: ReauthAction; target: string },
): Promise<boolean> {
  const found = await pinnedTx((tx) =>
    tx
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.authUserFk, authUserId),
          eq(authEvents.kind, kind),
          filter &&
            sql`${authEvents.detail}->>'action' = ${filter.action} and ${authEvents.detail}->>'target' = ${filter.target}`,
          gt(authEvents.createdAt, sql`now() - interval '10 minutes'`),
        ),
      )
      .limit(1),
  )
  return found.length > 0
}

/** Never throws: the request that caused the event is already done. */
export async function recordAuthEvent(
  kind: AuthEventKind,
  input: { authUserId?: string; detail?: Record<string, number | string> } = {},
): Promise<void> {
  try {
    await pinnedTx((tx) => tx.insert(authEvents).values({ authUserFk: input.authUserId, detail: input.detail, kind }))
    if (FAILURES.has(kind)) await alertOnSpike(kind)
  } catch (exception) {
    await logServerFailure('authEvents', `${kind} not recorded: ${stringifyError(exception)}`)
  }
}

async function alertOnSpike(kind: AuthEventKind): Promise<void> {
  const alert = await pinnedTx(async (tx) => {
    // One checker per kind at a time, so a burst alerts once.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`auth-spike:${kind}`}))`)
    const [recent] = await tx
      .select({ n: count() })
      .from(authEvents)
      .where(and(eq(authEvents.kind, kind), gt(authEvents.createdAt, sql`now() - interval '1 hour'`)))
    if (recent.n <= SPIKE) return false

    const [sent] = await tx
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.kind, 'alert_sent'),
          sql`${authEvents.detail}->>'kind' = ${kind}`,
          gte(authEvents.createdAt, sql`date_trunc('day', now())`),
        ),
      )
      .limit(1)
    if (sent != null) return false

    await tx.insert(authEvents).values({ detail: { kind }, kind: 'alert_sent' })
    return true
  })
  if (!alert) return

  // Imported late: adminAlert sends mail, and the mail sender records events here.
  const { alertAppAdmins } = await import('$lib/entities/notification/adminAlert.server')
  await alertAppAdmins({
    email: ({ at, locale }) => {
      const title = m.push_authSpikeTitle({ kind }, at)
      return {
        body: [m.email_authSpikeBody({ count: SPIKE, kind }, at)],
        footerReason: 'account',
        locale,
        meta: m.email_authSpikeMeta({}, at),
        origin: PUBLIC_ORIGIN,
        preheader: m.email_authSpikePreheader({}, at),
        subject: title,
        title,
      }
    },
    label: 'authSpike',
    push: ({ at }) => ({
      body: m.email_authSpikeBody({ count: SPIKE, kind }, at),
      pathname: '/settings/errors',
      tag: 'auth-spike',
      title: m.push_authSpikeTitle({ kind }, at),
    }),
  })
}
