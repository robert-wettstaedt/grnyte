/**
 * `updateRegionMapLayers` through the real handler, in a real RLS transaction.
 *
 * It replaces the whole layer list, so an empty submit is indistinguishable from a form that
 * rendered before its data arrived, and the payload has to prove which layers it replaces. Nothing
 * covered any of that: the staleness refusal, the two refusals either side of it and the write were
 * all unreached, which a mutation run is how we found out.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, callForm } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { updateRegionMapLayers } from './regions.remote'
import { emptyRegionSettings, mapLayersFingerprint, toLayerForm, type MapLayer, type RegionSettings } from './settings'

const REGION = '__map_layers_region__'
const UNREADABLE = '__map_layers_unreadable_region__'

/** `params` carries `LAYERS`, without which the pasted URL does not parse as a WMS request. */
const STORED: MapLayer = { name: 'Contours', params: { LAYERS: 'contours' }, type: 'wms', url: 'https://ex.test/wms' }
const SUBMITTED: MapLayer = { name: 'Aerial', params: { LAYERS: 'aerial' }, type: 'wms', url: 'https://ex.test/air' }

let admin: SeedUser
let outsider: SeedUser
let regionId = 0
let unreadableRegionId = 0

const settingsWith = (mapLayers: MapLayer[]): RegionSettings => ({ ...emptyRegionSettings(), mapLayers })

/** The one place a fixture may write `settings` directly: the INSERT, where there is nothing to
 *  merge with. Typed, because an `attributions` string where the schema wants `string[]` is
 *  dropped on read and nothing fails until a browser renders it. */
async function seedRegionWithSettings(name: string, settings: unknown, owner: SeedUser): Promise<number> {
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, settings)
    values (${name}, ${owner.userId}, ${sql.json(settings as never)}) returning id`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${region.id}, ${owner.userId}, ${owner.authId}, 'region_admin', true)`
  return region.id
}

const storedLayers = async (id: number): Promise<unknown> =>
  (await sql<{ layers: unknown }[]>`select settings -> 'mapLayers' as layers from public.regions where id = ${id}`).at(
    0,
  )?.layers

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ admin: 'admin@grnyte.rocks', outsider: 'user@grnyte.rocks' })
  admin = users.admin
  outsider = users.outsider

  regionId = await seedRegionWithSettings(REGION, settingsWith([STORED]), admin)
  // A blob this build cannot read whole: the layer list is not a list. It must refuse differently,
  // because "someone else changed this" would send the admin round a loop reopening cannot leave.
  unreadableRegionId = await seedRegionWithSettings(UNREADABLE, { mapLayers: 'not a list' }, admin)
})

beforeEach(async () => {
  if (!reachable) return

  await sql`
    update public.regions set settings = ${sql.json(settingsWith([STORED]) as never)} where id = ${regionId}`
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.region_members where region_fk in (${regionId}, ${unreadableRegionId})`
    await sql`delete from public.regions where id in (${regionId}, ${unreadableRegionId})`
  }
  await sql.end()
})

/**
 * `'saved'`, or the i18n key of the refusal.
 *
 * The key and not a boolean: every refusal here writes nothing, so a test asserting only "refused"
 * would pass just as happily on a validation error it never meant to trigger. That is exactly what
 * the first draft of this file did, while every URL was being rejected as malformed.
 *
 * A form signals success by THROWING a 303 redirect, so success is the exception path.
 */
async function submit(user: SeedUser, data: Record<string, unknown>): Promise<string> {
  try {
    const result = await asRequest<{ issues?: { message: string }[] }>(user.authId, () =>
      callForm(updateRegionMapLayers, data),
    )
    const [issue] = result.issues ?? []

    return issue == null ? 'resolved with no issue' : String((JSON.parse(issue.message) as { message: string }).message)
  } catch (error) {
    if ((error as { status?: number })?.status === 303) return 'saved'
    throw error
  }
}

describe.skipIf(!reachable)('updateRegionMapLayers staleness guard', () => {
  it('accepts a save whose fingerprint still describes the stored layers', async () => {
    // The positive control for every refusal below: same call shape, and it lands.
    const known = mapLayersFingerprint([STORED])

    expect(await submit(admin, { id: String(regionId), known, mapLayers: [toLayerForm(SUBMITTED)] })).toBe('saved')
    expect(await storedLayers(regionId)).toEqual([{ ...SUBMITTED, attributions: null, minZoom: null, opacity: null }])
  })

  it('refuses a save that describes a different set, and writes nothing', async () => {
    // Another admin saved between this form rendering and its submit. Holding the row says nothing
    // about what was on this admin's screen.
    const stale = mapLayersFingerprint([])

    expect(await submit(admin, { id: String(regionId), known: stale, mapLayers: [toLayerForm(SUBMITTED)] })).toBe(
      'region_mapLayersStale',
    )
    expect(await storedLayers(regionId)).toEqual([STORED])
  })

  it('refuses a save that omits the fingerprint, so a tab loaded before this deployed is stale', async () => {
    expect(await submit(admin, { id: String(regionId), mapLayers: [] })).toBe('region_mapLayersStale')
    expect(await storedLayers(regionId)).toEqual([STORED])
  })

  it('refuses an admin of no region at all, before it reads anything', async () => {
    expect(
      await submit(outsider, {
        id: String(regionId),
        known: mapLayersFingerprint([STORED]),
        mapLayers: [toLayerForm(SUBMITTED)],
      }),
    ).toBe('form_noPermission')
    expect(await storedLayers(regionId)).toEqual([STORED])
  })

  it('refuses a blob it cannot read whole, rather than calling it stale', async () => {
    // Two refusals, two answers: an unreadable blob is not "someone else changed this", and a
    // fingerprint over an empty list would otherwise match a blob that merely read as empty.
    expect(
      await submit(admin, { id: String(unreadableRegionId), known: mapLayersFingerprint([]), mapLayers: [] }),
    ).toBe('region_mapLayersUnreadableBody')
    expect(await storedLayers(unreadableRegionId)).toBe('not a list')
  })
})
