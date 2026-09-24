/**
 * Finishing a task retires the screen it was performed on. The exit pops or replaces the form's
 * history entry, so back from the destination reaches whatever was showing before the task began.
 * Without that the form is still on the stack and back reopens it, which is the report this fixes.
 *
 * Asserted on `history.length` as well as the URL: landing on the right screen is also what a plain
 * push would do on the way in, and only the entry count tells the two apart.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
// `testAccounts`, never `testDb`: that one opens its pool at module scope.
import { connect, resolveSeedUsers } from '../src/lib/db/testAccounts'
import { removeFixture, seedFixture, type Fixture } from './fixtures'
import { assertLocalStack, signedIn, visit } from './support'

const REGION = '__e2e_back__'
const DRIVER = 'maintainer@grnyte.rocks'
const SECOND = 'user@grnyte.rocks'

const PASSWORD = process.env.E2E_PASSWORD ?? ''

/** This file's own pool, for the same reason `form-seeding` keeps one. */
const sql = connect()

let context: BrowserContext
let fixture: Fixture
let page: Page

test.describe.configure({ mode: 'serial' })

const entryCount = (target: Page) => target.evaluate(() => history.length)

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
  await visit(page, `/blocks/${fixture.alphaBlockId}`)
  await expect(page.getByRole('link', { name: /Log ascent|E2E/ }).first()).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  try {
    await removeFixture(sql, REGION)
  } finally {
    await context?.close()
    await sql.end()
  }
})

test('back after logging an ascent reaches the block, not the form', async () => {
  const block = `/blocks/${fixture.alphaBlockId}`
  const route = `/routes/${fixture.richRouteId}`

  // The trail the report describes: the block is where the reader was before any of this. Every hop
  // is pinned, URL and entry count both, because a `waitForURL` resolves instantly when the URL
  // already matches, so a click that silently did nothing reads exactly like one that worked.
  await visit(page, block)
  await expect(page).toHaveURL(new RegExp(`${block}$`))
  const onBlock = await entryCount(page)

  await page.locator(`a[href="${route}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`${route}$`))
  expect(await entryCount(page), 'opening the route pushes one entry').toBe(onBlock + 1)

  await page.locator(`a[href="${route}/ascents/add"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`${route}/ascents/add$`))
  const onForm = await entryCount(page)
  expect(onForm, 'opening the form pushes one entry').toBe(onBlock + 2)

  await page.getByRole('radio', { name: 'Flash' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(new RegExp(`${route}$`))

  // Landing on the route is not proof the form SAVED: cancelling pops to exactly the same entry.
  // Without this the test passes on a flow that never wrote anything.
  const [saved] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.ascents
    where route_fk = ${fixture.richRouteId} and type = 'flash'`
  expect(saved.count, 'the submit actually logged an ascent').toBeGreaterThan(0)

  // The destination replaced or popped the form rather than stacking on top of it.
  expect(await entryCount(page), 'the finished form is retired, not stacked on').toBe(onForm)

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`${block}$`))
})

test('back after closing a deep-linked block sheet does not reopen it', async () => {
  await visit(page, `/blocks/${fixture.betaBlockId}`)
  const onSheet = await entryCount(page)

  await page.getByRole('button', { name: 'Close' }).and(page.locator(':visible')).first().click()
  await expect(page).toHaveURL(/\/explore/)

  // Dismissing is not a navigation the reader can undo: it replaced the sheet's entry.
  expect(await entryCount(page)).toBe(onSheet)

  await page.goBack()
  await expect(page).not.toHaveURL(new RegExp(`/blocks/${fixture.betaBlockId}$`))
})

/**
 * A screen reached through a resolver has nothing of the app behind it, so back must go up to the
 * parent rather than popping. `/ascents/[id]` resolves an ascent to its row in the route's ascent
 * list and forwards there with a replace.
 *
 * The store has to be WARM first. The resolver forwards from an `$effect` gated on a Zero read, and
 * only when that read is already local does the effect flush during hydration, ahead of the
 * navigation's own `afterNavigate`. Arriving cold, the row syncs first, the effect runs later, and
 * the safe path is taken. So a cold arrival cannot see this and passes either way.
 *
 * Its own page, not the shared one: the trail is per document, and a tab carrying earlier tests'
 * entries cannot tell "went up to the parent" from "popped to whatever was behind".
 */
test('back from an ascent deep link goes up to the route', async () => {
  // Warm the replica for this origin, so the resolver's read is local when the deep link mounts.
  await visit(page, `/routes/${fixture.richRouteId}/ascents`)
  await expect(page.locator(`#ascent-${fixture.richAscentId}`)).toBeVisible({ timeout: 30_000 })

  const deepLinked = await context.newPage()

  try {
    await visit(deepLinked, `/ascents/${fixture.richAscentId}`)
    await deepLinked.waitForURL(`**/routes/${fixture.richRouteId}/ascents**`)
    // The deep-linked row itself, which also proves the resolver picked the right list.
    await expect(deepLinked.locator(`#ascent-${fixture.richAscentId}`)).toBeVisible({ timeout: 30_000 })

    const before = await entryCount(deepLinked)

    await deepLinked.getByRole('button', { name: 'Back' }).first().click()
    await deepLinked.waitForURL(`**/routes/${fixture.richRouteId}`)

    // The count as well as the URL: going up REPLACES the resolved entry, while a pop would reach
    // the route too on a tab that happened to have it behind, and only the count tells them apart.
    expect(await entryCount(deepLinked)).toBe(before)
  } finally {
    await deepLinked.close()
  }
})
