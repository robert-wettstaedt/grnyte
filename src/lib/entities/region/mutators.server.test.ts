import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import type { SendEmailInput } from '$lib/email/send.server'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapLayersFingerprint } from './settings'

// The region mutators' wiring: settings writers, invitations with the mail after commit, members,
// and the two privileged paths. The bodies' own rules are covered by the `*.server.test.ts` beside them.
const mail = vi.hoisted(() => ({ result: true, sent: [] as SendEmailInput[] }))
vi.mock('$lib/email/send.server', () => ({
  sendEmail: async (input: SendEmailInput) => {
    mail.sent.push(input)
    return mail.result
  },
}))

let admin: SeedUser
let member: SeedUser
let invitee: SeedUser
let regionId = 0
let adminClient: ReturnType<typeof zeroClient>
let memberClient: ReturnType<typeof zeroClient>
let inviteeClient: ReturnType<typeof zeroClient>
const founded: number[] = []

beforeAll(async () => {
  if (!reachable) return
  ;({ regionId, user: admin } = await seedRegion('__region_mutators_region__', 'region_admin'))
  await sql`update public.regions set max_members = 10 where id = ${regionId}`
  member = await createThrowawayUser('region_mutators_member')
  invitee = await createThrowawayUser('region_mutators_invitee')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${member.userId}, ${member.authId}, 'region_user', true)`
  adminClient = zeroClient(admin.authId)
  memberClient = zeroClient(member.authId, member.email)
  inviteeClient = zeroClient(invitee.authId, invitee.email)
})

beforeEach(() => {
  mail.result = true
  mail.sent = []
})

afterAll(async () => {
  if (!reachable) return
  await adminClient.cleanup()
  await memberClient.cleanup()
  await inviteeClient.cleanup()
  const regionIds = [regionId, ...founded]
  await sql`delete from public.notifications where region_fk = any(${regionIds})`
  await sql`delete from public.events where region_fk = any(${regionIds})`
  await sql`delete from public.region_invitations where region_fk = any(${regionIds})`
  await sql`delete from public.region_members where region_fk = any(${regionIds})`
  await sql`delete from public.regions where id = any(${regionIds})`
  await dropThrowawayUser(member)
  await dropThrowawayUser(invitee)
})

const messageOf = (result: { message?: string }) => JSON.parse(result.message ?? '{}').message

async function invitationFor(email: string) {
  const [row] = await sql<{ delivered: Date | null; id: number; sent: Date | null }[]>`
    select id, last_sent_at as sent, last_delivered_at as delivered from public.region_invitations
    where region_fk = ${regionId} and email = ${email}`
  return row
}

const invitedEvents = (email: string) =>
  sql`select 1 from public.events where region_fk = ${regionId} and verb = 'invite' and metadata = ${email}`

describe.skipIf(!reachable)('region mutators: settings', () => {
  it('renames the region', async () => {
    expect(
      await adminClient.push('regions.update', { id: String(regionId), name: '__region_mutators_renamed__' }),
    ).toEqual({})
    expect((await sql`select name from public.regions where id = ${regionId}`)[0].name).toBe(
      '__region_mutators_renamed__',
    )
  })

  it('refuses a map-layer save that does not name what it loaded', async () => {
    const result = await adminClient.push('regions.updateMapLayers', {
      id: String(regionId),
      known: 'stale',
      mapLayers: [],
    })
    expect(messageOf(result)).toBe('region_mapLayersStale')

    const saved = await adminClient.push('regions.updateMapLayers', {
      id: String(regionId),
      known: mapLayersFingerprint([]),
      mapLayers: [],
    })
    expect(saved).toEqual({})
  })

  it('adds, refuses a duplicate of, renames and removes a tag', async () => {
    expect(await adminClient.push('regions.addTag', { name: 'Mutated', regionFk: regionId })).toEqual({})
    expect(messageOf(await adminClient.push('regions.addTag', { name: 'Mutated', regionFk: regionId }))).toBe(
      'region_tagDuplicate',
    )
    expect(await adminClient.push('regions.renameTag', { from: 'Mutated', regionFk: regionId, to: 'Renamed' })).toEqual(
      {},
    )
    expect(await adminClient.push('regions.removeTag', { name: 'Renamed', regionFk: regionId })).toEqual({})
  })

  it('refuses a member who administers nothing', async () => {
    expect(messageOf(await memberClient.push('regions.addTag', { name: 'Nope', regionFk: regionId }))).toBe(
      'form_noPermission',
    )
  })
})

describe.skipIf(!reachable)('region mutators: invitations', () => {
  it('mails after commit, stamps the delivery, and logs the invitation once it went out', async () => {
    const email = `__region_mutators_ok_${Date.now()}@grnyte.test`
    const result = await adminClient.push('regions.invite', { email, locale: 'de', regionFk: String(regionId) })

    expect(result.data).toEqual({ email })
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]).toMatchObject({ locale: 'de', to: email })
    const row = await invitationFor(email)
    expect(mail.sent[0].idempotencyKey).toBe(`invitation-${row.id}`)
    expect(row.delivered).toEqual(row.sent)
    expect(await invitedEvents(email)).toHaveLength(1)
  })

  it('leaves the delivery empty and logs nothing when the provider refuses the mail', async () => {
    mail.result = false
    const email = `__region_mutators_fail_${Date.now()}@grnyte.test`
    await adminClient.push('regions.invite', { email, regionFk: String(regionId) })

    const row = await invitationFor(email)
    expect(row.sent).not.toBeNull()
    expect(row.delivered).toBeNull()
    expect(await invitedEvents(email)).toHaveLength(0)
  })

  it('mails nobody for an invite it refuses', async () => {
    const result = await memberClient.push('regions.invite', {
      email: `__region_mutators_refused_${Date.now()}@grnyte.test`,
      regionFk: String(regionId),
    })

    expect(messageOf(result)).toBe('form_noPermission')
    expect(mail.sent).toHaveLength(0)
  })

  it('revokes, and restores through the undo', async () => {
    const email = `__region_mutators_revoke_${Date.now()}@grnyte.test`
    await adminClient.push('regions.invite', { email, regionFk: String(regionId) })
    const { id } = await invitationFor(email)

    expect((await adminClient.push('regions.revokeInvitation', { invitationFk: id })).data).toEqual({
      invitationFk: id,
    })
    expect((await sql`select status from public.region_invitations where id = ${id}`)[0].status).toBe('expired')
    expect(await adminClient.push('regions.restoreInvitation', { invitationFk: id })).toEqual({})
    expect((await sql`select status from public.region_invitations where id = ${id}`)[0].status).toBe('pending')
  })

  it('accepts only the invitation addressed to the caller, privileged', async () => {
    await adminClient.push('regions.invite', { email: invitee.email, regionFk: String(regionId) })
    const { id } = await invitationFor(invitee.email)

    // 404, as for an id that is not there: a 403 would tell the caller this is somebody's live invitation.
    const refused = await memberClient.push('regions.acceptInvitation', { invitationFk: id })
    expect(messageOf(refused)).toBe('invite_notFound')
    expect(refused.details).toEqual({ status: 404 })
    const accepted = await inviteeClient.push('regions.acceptInvitation', { invitationFk: id })
    expect(accepted.data).toMatchObject({ regionFk: regionId })
    expect(
      await sql`select 1 from public.region_members where region_fk = ${regionId} and user_fk = ${invitee.userId}`,
    ).toHaveLength(1)
  })
})

describe.skipIf(!reachable)('region mutators: members and founding', () => {
  it('changes a role, removes the member, and restores them from the snapshot', async () => {
    expect(
      await adminClient.push('regions.updateMemberRole', {
        regionFk: regionId,
        role: 'region_maintainer',
        userFk: member.userId,
      }),
    ).toEqual({})

    const removed = await adminClient.push('regions.removeMember', { regionFk: regionId, userFk: member.userId })
    expect(removed.data).toEqual({ regionFk: regionId, role: 'region_maintainer', userFk: member.userId })
    expect(await adminClient.push('regions.restoreMember', removed.data)).toEqual({})
    expect(
      await sql`select 1 from public.region_members where region_fk = ${regionId} and user_fk = ${member.userId}`,
    ).toHaveLength(1)
  })

  it('refuses the owner leaving beside a second admin, and lets that admin leave', async () => {
    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      select ${regionId}, ${invitee.userId}, ${invitee.authId}, 'region_admin', true
      where not exists (select 1 from public.region_members where region_fk = ${regionId} and user_fk = ${invitee.userId})`

    expect(messageOf(await adminClient.push('regions.leave', { regionFk: regionId }))).toMatch(/hand/i)
    expect(await inviteeClient.push('regions.leave', { regionFk: regionId })).toEqual({})
  })

  it('founds a region with its founder as admin, privileged', async () => {
    const result = await memberClient.push('regions.create', { name: '__region_mutators_founded__' })
    const regionFk = (result.data as { regionId: number }).regionId
    founded.push(regionFk)

    const [row] = await sql<{ role: string }[]>`
      select role from public.region_members where region_fk = ${regionFk} and user_fk = ${member.userId}`
    expect(row?.role).toBe('region_admin')
  })
})
