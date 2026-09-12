/**
 * Every add and edit form, driven across two entities on one route. A remote form's fields live on a
 * module-level singleton, and a full page load would rebuild it and hide the bug, hence
 * `assertSameDocument` after every hop. Blank assertions use a locator, never `formValues`.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
// `testAccounts`, never `testDb`: that one opens its pool at module scope.
import { connect, resolveSeedUsers } from '../src/lib/db/testAccounts'
import { removeFixture, seedFixture, type Fixture } from './fixtures'
import {
  assertLocalStack,
  assertSameDocument,
  field,
  formValues,
  manageLink,
  markDocument,
  readForm,
  signedIn,
  visit,
} from './support'

const REGION = '__e2e_forms__'
const DRIVER = 'maintainer@grnyte.rocks'
const SECOND = 'user@grnyte.rocks'

const PASSWORD = process.env.E2E_PASSWORD ?? ''

/** This file's own pool: Playwright runs every spec in one worker process, so `testDb`'s exported
 *  `sql` is shared and the first `end()` strands the others. */
const sql = connect()

let context: BrowserContext
let fixture: Fixture
let page: Page

test.describe.configure({ mode: 'serial' })

/**
 * Follow a link by href and wait for that page. The wait IS the helper: `click()` resolves on
 * dispatch, not on navigation, so without it a walk runs against the page it started from.
 * Playwright's auto-wait hides that whenever the next link is absent from the current page.
 *
 * Anchored, so `/areas/1` does not match `/areas/1/edit`.
 */
async function clickTo(target: Page, href: string) {
  await target.locator(`a[href="${href}"]`).first().click()
  await target.waitForURL(new RegExp(`${href}(?:$|[?#])`))
}

/** Root lists every sector, and each sector its blocks, so this is the hop between any two. By
 *  href, never by name: these pages also list every route beneath the area, so a name regex has
 *  rows to collide with and `.first()` would decide the test by DOM order. */
async function hopTo(target: Page, areaId: number, blockId?: number) {
  await clickTo(target, `/areas/${fixture.rootAreaId}`)
  await clickTo(target, `/areas/${areaId}`)
  if (blockId != null) await clickTo(target, `/blocks/${blockId}`)
}

/** Settings is the only screen listing both regions, so it is the hop between them. By href: the
 *  fixture region's name is a prefix of the alt region's. */
async function hopToRegion(target: Page, regionId: number, row: string) {
  await target.getByRole('button', { name: 'Back' }).first().click()
  await expect(target).toHaveURL(/\/settings$/)
  await clickTo(target, `/settings/regions/${regionId}`)
  await target
    .getByRole('link', { name: new RegExp(row) })
    .first()
    .click()
}

/** By href, as in {@link hopTo}: a nameless route's row reads "Unnamed". */
async function openRoute(target: Page, routeId: number) {
  await clickTo(target, `/routes/${routeId}`)
}

test.beforeAll(async ({ browser }) => {
  const reachable = await sql`select 1`.then(
    () => true,
    () => false,
  )
  await assertLocalStack(reachable, PASSWORD)

  const seeds = await resolveSeedUsers(sql, { driver: DRIVER, second: SECOND })
  fixture = await seedFixture(sql, REGION, seeds.driver, seeds.second)
  ;({ context, page } = await signedIn(browser, DRIVER, PASSWORD))

  // The tree went straight into Postgres, so wait for Zero to replicate it.
  await visit(page, `/areas/${fixture.rootAreaId}`)
  await expect(page.getByText('E2E Alpha')).toBeVisible({ timeout: 30_000 })

  // The second region syncs separately, so it needs a wait of its own.
  await visit(page, `/settings/regions/${fixture.altRegionId}/map-layers`)
  await expect(field(page, 'mapLayers[0].name')).toHaveValue('E2E Relief', { timeout: 30_000 })
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

test('add block blanks between two areas', async () => {
  await visit(page, `/areas/${fixture.alphaSectorId}/blocks/add`)
  await markDocument(page)
  await page.getByLabel(/Block name/).fill('LEAK PROBE BLOCK')

  await hopTo(page, fixture.betaSectorId)
  await manageLink(page, 'Add block')

  // `areaId` comes from the loaded area, so it only says the destination is on screen. The blank
  // assertion below is what proves the re-seed ran.
  const values = await readForm(
    page,
    new RegExp(`/areas/${fixture.betaSectorId}/blocks/add`),
    'areaId',
    String(fixture.betaSectorId),
  )
  expect(values.areaId).toBe(String(fixture.betaSectorId))
  await expect(field(page, 'name')).toHaveValue('')
})

test('edit area reseeds from the area being edited', async () => {
  await visit(page, `/areas/${fixture.alphaSectorId}/edit`)
  await markDocument(page)
  await page.getByLabel(/Area name/).fill('LEAK PROBE AREA')

  await hopTo(page, fixture.betaSectorId)
  await manageLink(page, 'Edit')

  const values = await readForm(page, new RegExp(`/areas/${fixture.betaSectorId}/edit`), 'name', 'E2E Beta')
  expect(values.id).toBe(String(fixture.betaSectorId))
  await expect(field(page, 'description')).toHaveValue('')
})

test('edit route drops the previous grade, description and first ascensionists', async () => {
  await visit(page, `/routes/${fixture.richRouteId}/edit`)
  await markDocument(page)
  await expect(field(page, 'name')).toHaveValue('Alpha Route')
  await expect(page.getByText(fixture.firstAscensionist)).toBeVisible()
  // `pressed`, because the vocabulary word is on screen whether or not the chip is selected.
  await expect(page.getByRole('button', { name: fixture.routeTag, pressed: true })).toHaveCount(1)
  await page.getByLabel(/Route name/).fill('LEAK PROBE ROUTE')

  await hopTo(page, fixture.alphaSectorId, fixture.alphaBlockId)
  await openRoute(page, fixture.sparseRouteId)
  await manageLink(page, 'Edit')

  // `id`, not `blockId`: both routes sit on Alpha Block, so that one held already on the page
  // being left. `id` comes from this page's `fields.set`, so it holds only after the re-seed.
  const values = await readForm(
    page,
    new RegExp(`/routes/${fixture.sparseRouteId}/edit`),
    'id',
    String(fixture.sparseRouteId),
  )
  // The staleness key, asserted on the counts it leads with rather than on being present: the rich
  // route carries one of each, so a truthy check would hold for ITS key surviving the hop too.
  expect(values.known).toMatch(/^0\.0-/)
  await expect(field(page, 'name')).toHaveValue('')
  await expect(field(page, 'gradeFk')).toHaveValue('')
  await expect(field(page, 'description')).toHaveValue('')
  await expect(page.getByText('Alpha description')).toHaveCount(0)
  // The chip lists are dynamic children, so they are the likeliest to survive the hop.
  await expect(page.getByText(fixture.firstAscensionist)).toHaveCount(0)
  await expect(page.getByRole('button', { name: fixture.routeTag, pressed: true })).toHaveCount(0)
})

test('map layers reseeds its staleness key with the layers', async () => {
  await visit(page, `/settings/regions/${fixture.altRegionId}/map-layers`)
  await markDocument(page)
  const before = await readForm(
    page,
    new RegExp(`/settings/regions/${fixture.altRegionId}/map-layers`),
    'mapLayers[0].name',
    'E2E Relief',
  )

  await page.getByRole('button', { name: 'Cancel' }).click()
  await hopToRegion(page, fixture.regionId, 'Map layers')

  // This region has no layers, so the empty state is what says the form is loaded.
  await expect(page.getByText(/No map layers yet/)).toBeVisible()

  const values = await readForm(
    page,
    new RegExp(`/settings/regions/${fixture.regionId}/map-layers`),
    'id',
    String(fixture.regionId),
  )
  expect(values['mapLayers[0].name']).toBeUndefined()
  // The guard the settings writer compares against, so carrying the other region's would wedge
  // every save of this row.
  expect(values.known).not.toBe(before.known)
  await expect(page.getByText('E2E Relief')).toHaveCount(0)
})

test('region name reseeds between regions', async () => {
  await visit(page, `/settings/regions/${fixture.altRegionId}/name`)
  await markDocument(page)
  await expect(field(page, 'name')).toHaveValue(`${REGION}_alt`)
  await page.getByLabel(/Region name/).fill('LEAK PROBE REGION')

  await page.getByRole('button', { name: 'Cancel' }).click()
  await hopToRegion(page, fixture.regionId, 'Region name')

  const values = await readForm(page, new RegExp(`/settings/regions/${fixture.regionId}/name`), 'name', REGION)
  expect(values.id).toBe(String(fixture.regionId))
})

test('add sub-area reseeds its parent', async () => {
  await visit(page, `/areas/${fixture.rootAreaId}/add`)
  await markDocument(page)
  await page.getByLabel(/Area name/).fill('LEAK PROBE SUBAREA')

  await hopTo(page, fixture.spareAreaId)
  await manageLink(page, 'Add area')

  const values = await readForm(
    page,
    new RegExp(`/areas/${fixture.spareAreaId}/add`),
    'parentFk',
    String(fixture.spareAreaId),
  )
  expect(values.parentFk).toBe(String(fixture.spareAreaId))
  await expect(field(page, 'name')).toHaveValue('')
})

test('add route blanks its grade and tags between two blocks', async () => {
  await visit(page, `/blocks/${fixture.alphaBlockId}/routes/add`)
  await markDocument(page)
  await page.getByLabel(/Route name/).fill('LEAK PROBE NEW ROUTE')

  // Asserted before the click, or the "nothing is pressed" check below passes for want of tags.
  const tag = page.getByRole('button', { exact: true, name: 'benchmark' })
  await expect(tag).toBeVisible()
  await tag.click()

  await hopTo(page, fixture.betaSectorId, fixture.betaBlockId)
  await manageLink(page, 'Add route')

  const values = await readForm(
    page,
    new RegExp(`/blocks/${fixture.betaBlockId}/routes/add`),
    'blockId',
    String(fixture.betaBlockId),
  )
  expect(values.blockId).toBe(String(fixture.betaBlockId))
  await expect(field(page, 'name')).toHaveValue('')
  await expect(field(page, 'gradeFk')).toHaveValue('')
  await expect(page.getByRole('button', { exact: true, name: 'benchmark' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'benchmark', pressed: true })).toHaveCount(0)
})

test('edit block reseeds its map pin', async () => {
  await visit(page, `/blocks/${fixture.alphaBlockId}/edit`)
  await markDocument(page)
  const before = await readForm(page, new RegExp(`/blocks/${fixture.alphaBlockId}/edit`), 'name', 'Alpha Block')

  await hopTo(page, fixture.betaSectorId, fixture.betaBlockId)
  await manageLink(page, 'Edit')

  const values = await readForm(page, new RegExp(`/blocks/${fixture.betaBlockId}/edit`), 'name', 'Beta Block')
  expect(values.id).toBe(String(fixture.betaBlockId))
  // BlockForm re-seeds the pin itself rather than being rebuilt by a `{#key}`.
  expect(Number(values.lat)).toBeCloseTo(47.222222, 4)
  expect(Number(values.lat)).not.toBeCloseTo(Number(before.lat), 4)
  // The staleness proof rides on the pin, so it has to follow it. Carrying Alpha's across would
  // wedge every save of Beta. Meaningful only because the two blocks have different pins.
  expect(values.known).toBeTruthy()
  expect(values.known).not.toBe(before.known)
})

test('add parking reseeds its pin between two sectors', async () => {
  await visit(page, `/areas/${fixture.alphaSectorId}/parking/edit`)
  await markDocument(page)
  // The pin, not `areaId`: that one comes from `page.params` and flips with the URL.
  await expect(field(page, 'lat')).not.toHaveValue('')
  const before = await formValues(page)
  expect(before.areaId).toBe(String(fixture.alphaSectorId))

  await page.getByRole('button', { name: 'Cancel' }).click()
  await hopTo(page, fixture.betaSectorId)
  await manageLink(page, 'Add parking')

  await expect(page).toHaveURL(new RegExp(`/areas/${fixture.betaSectorId}/parking/edit`))
  await expect(field(page, 'lat')).not.toHaveValue('')
  // Explicit because this test reads with `formValues` rather than `readForm`, which does it
  // itself. After the waits, never before.
  await assertSameDocument(page, 'the hop to the second sector')

  const values = await formValues(page)
  expect(values.areaId).toBe(String(fixture.betaSectorId))
  expect(Number(values.lat)).not.toBeCloseTo(Number(before.lat), 4)
})

test('log ascent blanks its type and date between two routes', async () => {
  await visit(page, `/routes/${fixture.richRouteId}/ascents/add`)
  await markDocument(page)
  await page.getByRole('radio', { name: 'Flash' }).click()
  await page.getByRole('button', { name: 'Yesterday' }).click()
  const probe = await formValues(page)
  expect(probe.type).toBe('flash')

  await hopTo(page, fixture.betaSectorId, fixture.betaBlockId)
  await openRoute(page, fixture.betaRouteId)
  await page.getByRole('link', { name: 'Log ascent' }).first().click()

  const values = await readForm(
    page,
    new RegExp(`/routes/${fixture.betaRouteId}/ascents/add`),
    'routeId',
    String(fixture.betaRouteId),
  )
  expect(values.routeId).toBe(String(fixture.betaRouteId))
  // No radio is the blank state, so it is asserted by count rather than by an absent key.
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
  // Back to today's default, not yesterday and not empty. Polled because `routeId` comes from the
  // loaded route, so it can hold a flush before the re-seed lands.
  await expect
    .poll(async () => (await formValues(page)).dateTime, { message: 'the date never reset' })
    .not.toBe(probe.dateTime)
  expect((await formValues(page)).dateTime).toBeTruthy()
})

test('edit ascent drops the previous notes, grade and rating', async () => {
  await visit(page, `/ascents/${fixture.richAscentId}/edit`)
  await markDocument(page)
  await expect(field(page, 'notes')).toHaveValue('Alpha ascent notes')

  await hopTo(page, fixture.betaSectorId, fixture.betaBlockId)
  await openRoute(page, fixture.betaRouteId)
  await page.getByRole('button', { name: 'Details' }).first().click()
  await page.getByRole('link', { exact: true, name: 'Edit' }).first().click()

  // `id` over `routeId`: it names the ascent under test rather than its route.
  await readForm(page, new RegExp(`/ascents/${fixture.sparseAscentId}/edit`), 'id', String(fixture.sparseAscentId))
  // Retrying locators, not a single read: nothing here comes from `fields.set`, so the DOM can
  // exist a flush before the re-seed writes to it.
  await expect(page.getByRole('radio', { name: 'Flash' })).toBeChecked()
  await expect(field(page, 'notes')).toHaveValue('')
  await expect(field(page, 'gradeFk')).toHaveValue('')
  await expect(page.getByText('Alpha ascent notes')).toHaveCount(0)
})
