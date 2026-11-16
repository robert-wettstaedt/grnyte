/** Auth events: a burst of one failure kind alerts the admins once a day; mail quota never does. */
import { reachable, sql } from '$lib/db/testDb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordAuthEvent } from './events.server'

const alerts = vi.hoisted(() => vi.fn())
vi.mock('$lib/entities/notification/adminAlert.server', () => ({ alertAppAdmins: alerts }))

const burst = async (kind: 'handoff_failed' | 'mail_quota' | 'oauth_state_mismatch' | 'reauth_failed') => {
  for (let i = 0; i < 21; i++) await recordAuthEvent(kind)
}

beforeEach(async () => {
  alerts.mockClear()
  if (reachable)
    await sql`delete from public.auth_events where kind in ('reauth_failed', 'oauth_state_mismatch', 'handoff_failed', 'mail_quota', 'alert_sent')`
})

describe.skipIf(!reachable)('recordAuthEvent', () => {
  it('alerts once for 21 reauth_failed events in an hour, and not again for a second burst that day', async () => {
    await burst('reauth_failed')
    expect(alerts).toHaveBeenCalledOnce()

    await burst('reauth_failed')
    expect(alerts).toHaveBeenCalledOnce()
  })

  it('alerts once for 21 oauth_state_mismatch events in an hour', async () => {
    await burst('oauth_state_mismatch')

    expect(alerts).toHaveBeenCalledOnce()
  })

  it('counts handoff_failed as a failure kind', async () => {
    await burst('handoff_failed')

    expect(alerts).toHaveBeenCalledOnce()
  })

  it('never alerts on mail_quota events', async () => {
    await burst('mail_quota')

    expect(alerts).not.toHaveBeenCalled()
  })
})
