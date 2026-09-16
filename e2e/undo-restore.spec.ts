/**
 * Delete something, then take it back from the snackbar: the only safety net on deletes that never
 * confirm. Assertions read the database, because a toast saying "restored" and a row that never came
 * back look the same from the page.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
// `testAccounts`, never `testDb`: that one opens its pool at module scope.
import { connect, resolveSeedUsers } from '../src/lib/db/testAccounts'
import { removeFixture, seedFixture, type Fixture } from './fixtures'
import { assertLocalStack, manageAction, signedIn, visit } from './support'

const REGION = '__e2e_undo__'
const DRIVER = 'maintainer@grnyte.rocks'
const SECOND = 'user@grnyte.rocks'
/** The username of {@link SECOND}, which is how their member row is labelled. */
const SECOND_NAME = 'user'

const PASSWORD = process.env.E2E_PASSWORD ?? ''

/** This file's own pool, for the reason given in `form-seeding.spec.ts`. */
const sql = connect()

type Soft = 'areas' | 'blocks' | 'reactions' | 'routes'

let context: BrowserContext
let fixture: Fixture
let page: Page
let parkingId = 0
let secondUserId = 0

test.describe.configure({ mode: 'serial' })

/** Poll rather than assert once: the click returns before the write has landed and synced back. */
async function expectState(table: Soft, id: number, want: 'deleted' | 'live' | 'missing') {
  await expect.poll(async () => rowState(table, id), { timeout: 15_000 }).toBe(want)
}

async function rowState(table: Soft, id: number): Promise<'deleted' | 'live' | 'missing'> {
  const [row] = await sql<{ deletedAt: Date | null }[]>`
    select deleted_at as "deletedAt" from ${sql(table)} where id = ${id}`

  if (row == null) return 'missing'

  return row.deletedAt == null ? 'live' : 'deleted'
}

/** Exactly one row, never `.first()`: these pages list several members as buttons, and picking the
 *  wrong one removes the wrong thing. */
function theRow(target: Page, name: RegExp) {
  return target.getByRole('button', { name })
}

/** Scoped to the snackbar and exact: an unscoped "Undo" also matches row buttons containing it. */
async function undo(target: Page) {
  const button = target
    .getByRole('region', { name: /Notifications/ })
    .getByRole('button', { exact: true, name: 'Undo' })

  await expect(button).toBeVisible()
  await button.click()
}

test.beforeAll(async ({ browser }) => {
  const reachable = await sql`select 1`.then(
    () => true,
    () => false,
  )
  await assertLocalStack(reachable, PASSWORD)

  const seeds = await resolveSeedUsers(sql, { driver: DRIVER, second: SECOND })
  secondUserId = seeds.second.userId
  fixture = await seedFixture(sql, REGION, seeds.driver, seeds.second)

  // Parking is a geolocation hanging off an area. Seeded, not added through the wizard.
  const [pin] = await sql<{ id: number }[]>`
    insert into public.geolocations (lat, long, area_fk, region_fk)
    values (47.333333, 8.333333, ${fixture.alphaSectorId}, ${fixture.regionId}) returning id`
  parkingId = pin.id
  ;({ context, page } = await signedIn(browser, DRIVER, PASSWORD))

  // The tree went straight into Postgres, so wait for Zero to replicate it.
  await visit(page, `/areas/${fixture.rootAreaId}`)
  await expect(page.getByText('E2E Alpha')).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  try {
    await removeFixture(sql, REGION)
  } finally {
    // In the `finally`, or a throwing teardown leaves a context syncing for the rest of the run.
    await context?.close()
    await sql.end()
  }
})

/** `deleteRoute` picks its mode from the data: a route with dependents is soft-deleted and undone
 *  in place, a bare one is erased and re-inserted. Both paths get a test, because they differ in
 *  the id. */
test('a deleted route with an ascent is restored in place', async () => {
  await visit(page, `/routes/${fixture.richRouteId}`)
  await manageAction(page, 'Delete route')
  await expectState('routes', fixture.richRouteId, 'deleted')

  await undo(page)
  await expectState('routes', fixture.richRouteId, 'live')

  const [row] = await sql<{ blockFk: number; name: string; regionFk: number }[]>`
    select block_fk as "blockFk", name, region_fk as "regionFk"
    from public.routes where id = ${fixture.richRouteId}`
  expect(row.blockFk).toBe(fixture.alphaBlockId)
  expect(row.regionFk).toBe(fixture.regionId)
  expect(row.name).toBe('Alpha Route')
})

test('a deleted bare route is erased and comes back under a new id', async () => {
  const bare = async () => sql<{ id: number }[]>`
    select id from public.routes
    where block_fk = ${fixture.alphaBlockId} and name = 'Bare Route' and deleted_at is null`

  await visit(page, `/routes/${fixture.bareRouteId}`)
  await manageAction(page, 'Delete route')

  // No `deleted_at` to wait for: with no ascents, files or topo lines the row is gone outright.
  await expectState('routes', fixture.bareRouteId, 'missing')

  await undo(page)
  await expect.poll(async () => (await bare()).length, { timeout: 15_000 }).toBe(1)

  // Undo rebuilds the route, so every link to the old id is dead afterwards.
  const [restored] = await bare()
  expect(restored.id).not.toBe(fixture.bareRouteId)
})

test('deleting an area cascades, and undo restores only what that delete marked', async () => {
  await visit(page, `/areas/${fixture.betaSectorId}`)
  await manageAction(page, 'Delete area')

  await expectState('areas', fixture.betaSectorId, 'deleted')
  await expectState('blocks', fixture.betaBlockId, 'deleted')
  await expectState('routes', fixture.betaRouteId, 'deleted')

  await undo(page)

  await expectState('areas', fixture.betaSectorId, 'live')
  await expectState('blocks', fixture.betaBlockId, 'live')
  await expectState('routes', fixture.betaRouteId, 'live')

  // Already deleted before this test ran, so a restore that cleared every `deleted_at` under the
  // area would revive it.
  expect(await rowState('routes', fixture.preDeletedRouteId)).toBe('deleted')
})

test('deleting a block cascades, and undo restores the area type it changed', async () => {
  await visit(page, `/blocks/${fixture.betaBlockId}`)
  await manageAction(page, 'Delete block')

  await expectState('blocks', fixture.betaBlockId, 'deleted')
  await expectState('routes', fixture.betaRouteId, 'deleted')

  await undo(page)

  await expectState('blocks', fixture.betaBlockId, 'live')
  await expectState('routes', fixture.betaRouteId, 'live')
  expect(await rowState('routes', fixture.preDeletedRouteId)).toBe('deleted')

  // `area.type` is derived from content, so undo has to put it back, not just clear the flag.
  await expect
    .poll(
      async () => {
        const [row] = await sql<{ type: null | string }[]>`
          select type from public.areas where id = ${fixture.betaSectorId}`
        return row?.type
      },
      { timeout: 15_000 },
    )
    .toBe('sector')
})

test('a removed member comes back with their role', async () => {
  await visit(page, `/regions/${fixture.regionId}`)

  const row = theRow(page, new RegExp(`\\b${SECOND_NAME}\\b`))
  await expect(row).toHaveCount(1)
  await row.click()
  await page.getByRole('button', { exact: true, name: 'Remove' }).click()

  const membership = async () => sql<{ role: string }[]>`
    select role from public.region_members
    where region_fk = ${fixture.regionId} and user_fk = ${secondUserId}`

  await expect.poll(async () => (await membership()).length, { timeout: 15_000 }).toBe(0)

  await undo(page)

  await expect.poll(async () => (await membership()).length, { timeout: 15_000 }).toBe(1)
  const [restored] = await membership()
  expect(restored.role).toBe('region_user')
})

test('a revoked invitation comes back pending, in place', async () => {
  await visit(page, `/regions/${fixture.regionId}`)

  const row = theRow(page, /@grnyte\.test/)
  await expect(row).toHaveCount(1)
  await row.click()
  await page.getByRole('button', { name: 'Revoke invitation' }).click()

  const status = async () => {
    const [row] = await sql<{ status: string }[]>`
      select status from public.region_invitations where id = ${fixture.invitationId}`
    return row?.status
  }

  await expect.poll(status, { timeout: 15_000 }).not.toBe('pending')

  await undo(page)

  await expect.poll(status, { timeout: 15_000 }).toBe('pending')
})

test('a deleted parking comes back at the same spot', async () => {
  await visit(page, `/parking/${parkingId}`)
  await manageAction(page, 'Delete parking')

  await expect
    .poll(async () => (await sql`select 1 from public.geolocations where id = ${parkingId}`).length, {
      timeout: 15_000,
    })
    .toBe(0)

  await undo(page)

  // Restored as a new row, so this asserts on the area and coordinates, not the id.
  await expect
    .poll(
      async () => {
        const rows = await sql<{ lat: number }[]>`
          select lat from public.geolocations where area_fk = ${fixture.alphaSectorId}`
        return rows.length === 1 ? Number(rows[0].lat) : null
      },
      { timeout: 15_000 },
    )
    .toBeCloseTo(47.333333, 4)
})

test('a deleted comment comes back with its body', async () => {
  await visit(page, `/events/${fixture.eventId}`)

  // Typed, not filled: the comment box is a rich-text editor, and a direct set leaves Post
  // disabled.
  const editor = page.getByRole('textbox').last()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('E2E undo comment')

  const post = page.getByRole('button', { name: 'Post' })
  await expect(post).toBeEnabled()
  await post.click()

  const findComment = async () => {
    const [row] = await sql<{ id: number }[]>`
      select id from public.reactions where event_fk = ${fixture.eventId} and type = 'comment'`
    return row?.id ?? 0
  }

  await expect.poll(findComment, { timeout: 15_000 }).not.toBe(0)
  const commentId = await findComment()

  await page.getByRole('button', { name: 'Delete comment' }).click()
  await expectState('reactions', commentId, 'deleted')

  await undo(page)
  await expectState('reactions', commentId, 'live')

  const [row] = await sql<{ body: string }[]>`select body from public.reactions where id = ${commentId}`
  expect(row.body).toContain('E2E undo comment')
})
