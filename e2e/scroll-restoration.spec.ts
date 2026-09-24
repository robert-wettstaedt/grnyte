/**
 * Where a screen's scroll container lands when the app navigates. Nothing in the app scrolls the
 * window, so Kit's own handling never fires and both halves are the app's own: a push starts at the
 * top, and back restores what the entry was left at.
 *
 * Driven rather than unit-tested because the unit tests drive a fake container. Only a real browser
 * shows Kit's `snapshot` storing an offset against a history entry, and only real data makes a
 * container's height depend on rows that arrive after the route renders.
 *
 * The viewport is deliberately short. At a desktop height the fixture's screens fit, the browser
 * clamps every offset to zero, and every assertion below passes whether or not the rule is there.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
// `testAccounts`, never `testDb`: that one opens its pool at module scope.
import { connect, resolveSeedUsers } from '../src/lib/db/testAccounts'
import { removeFixture, seedFixture, type Fixture } from './fixtures'
import { assertLocalStack, assertSameDocument, markDocument, signedIn, visit } from './support'

const REGION = '__e2e_scroll__'
const DRIVER = 'maintainer@grnyte.rocks'
const SECOND = 'user@grnyte.rocks'

const PASSWORD = process.env.E2E_PASSWORD ?? ''

/** Short enough that the fixture's screens overflow it. See the file comment. */
const VIEWPORT = { height: 360, width: 375 }

/** This file's own pool, for the same reason `back-navigation` keeps one. */
const sql = connect()

let context: BrowserContext
let fixture: Fixture
let page: Page

test.describe.configure({ mode: 'serial' })

/** The layout's scroll container. Every `(app)` screen has exactly one. */
const offset = (target: Page) => target.evaluate(() => document.querySelector('main')?.scrollTop ?? -1)

/**
 * A restore does not land in one frame. Rows arrive after the route renders, so the first write
 * clamps and the re-apply carries it the rest of the way. Every restore assertion polls.
 */
const expectOffset = (target: Page, expected: number, because: string) =>
  expect.poll(() => offset(target), { message: because, timeout: 15_000 }).toBe(expected)

/**
 * Fail on the real problem, not on the offset it produces. A screen whose rows are not local renders
 * its not-found state, which has nothing to scroll, so an offset assertion there reports 0.
 */
const expectScreenRendered = async (target: Page) => {
  await expect(target.getByRole('heading', { name: /not found/i })).toBeHidden()
}

/**
 * Step through history and wait for the app to arrive, not just for the URL to change. A history
 * move changes the URL before Kit has navigated, so a second move issued straight after races the
 * first and Kit drops it.
 */
const hop = async (target: Page, direction: 'back' | 'forward', url: string, arrived: Locator) => {
  await (direction === 'back' ? target.goBack() : target.goForward())
  await target.waitForURL(url)
  await expect(arrived).toBeVisible()
  await expectScreenRendered(target)
}

/** Something only the route detail screen renders. Its name is body text, not a heading. */
const onRouteScreen = (target: Page) => target.getByRole('link', { name: /See all \d+ ascents?/ })

/** Something only the log-ascent form renders. */
const onFormScreen = (target: Page) => target.getByRole('heading', { name: 'Log ascent' })

/** Open `path`, stamp the document, and leave the container scrolled to its end. */
const openScrolled = async (target: Page, path: string) => {
  await visit(target, path)
  await markDocument(target)
  return scrollToBottom(target)
}

/** Follow `name` and wait for `url`, asserting the hop stayed in the same document. */
const follow = async (target: Page, name: RegExp, url: string) => {
  await target.getByRole('link', { name }).first().click()
  await target.waitForURL(url)
}

/**
 * Follow a link without letting Playwright scroll it into view first. `click()` scrolls the target
 * on screen, so a link at the top of a scrolled screen moves the reader to the top BEFORE
 * navigating, and the entry then correctly stores zero. `dispatchEvent` skips that scroll and still
 * fires a real click the router intercepts.
 */
const followWithoutScrolling = async (target: Page, name: RegExp, url: string) => {
  await target.getByRole('link', { name }).first().dispatchEvent('click')
  await target.waitForURL(url)
}

const scrollToBottom = async (target: Page) => {
  await target.evaluate(() => {
    const main = document.querySelector('main')
    if (main != null) main.scrollTop = main.scrollHeight
  })
  const landed = await offset(target)
  // The guard that makes the rest of the file mean anything: a screen that does not scroll would
  // report 0 here and then "pass" every assertion below.
  expect(landed, 'the screen has to overflow the viewport for any of this to be observable').toBeGreaterThan(0)
  return landed
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
  await page.setViewportSize(VIEWPORT)

  // The tree went straight into Postgres, so wait for Zero to replicate it.
  await visit(page, `/routes/${fixture.richRouteId}`)
  await expect(page.getByRole('link', { name: /Log ascent/ }).first()).toBeVisible({ timeout: 30_000 })
})

test.afterAll(async () => {
  try {
    await removeFixture(sql, REGION)
  } finally {
    await context?.close()
    await sql.end()
  }
})

test('a forward navigation starts at the top', async () => {
  const left = await openScrolled(page, `/routes/${fixture.richRouteId}`)

  await follow(page, /Log ascent/, `**/routes/${fixture.richRouteId}/ascents/add`)
  // A full load would rebuild the module under test and make this pass either way.
  await assertSameDocument(page, 'log ascent')

  expect(left).toBeGreaterThan(0)
  expect(await offset(page)).toBe(0)
})

test('going back restores where the reader was', async () => {
  const left = await openScrolled(page, `/routes/${fixture.richRouteId}`)

  await follow(page, /Log ascent/, `**/routes/${fixture.richRouteId}/ascents/add`)
  await hop(page, 'back', `**/routes/${fixture.richRouteId}`, onRouteScreen(page))

  await expectOffset(page, left, 'back returns the reader to where they left the route')
})

test('going forward again returns to the offset that entry was left at', async () => {
  await visit(page, `/routes/${fixture.richRouteId}`)
  await markDocument(page)

  await follow(page, /Log ascent/, `**/routes/${fixture.richRouteId}/ascents/add`)
  const onForm = await scrollToBottom(page)

  await hop(page, 'back', `**/routes/${fixture.richRouteId}`, onRouteScreen(page))
  await hop(page, 'forward', `**/routes/${fixture.richRouteId}/ascents/add`, onFormScreen(page))

  await expectOffset(page, onForm, 'forward again returns to the offset that entry was left at')
})

test('two scrolled entries restore independently', async () => {
  const onRoute = await openScrolled(page, `/routes/${fixture.richRouteId}`)

  await follow(page, /Log ascent/, `**/routes/${fixture.richRouteId}/ascents/add`)
  const onForm = await scrollToBottom(page)

  // A third entry within the same layout, deliberately not the explore map: hopping there makes the
  // route's rows non-local on the way back, the screen renders its not-found state, and the offset
  // this test reads belongs to that error page rather than to the form. The unmount-and-remount
  // round trip is covered by the unit tests instead.
  await followWithoutScrolling(page, /Alpha Route/, `**/routes/${fixture.richRouteId}`)

  await hop(page, 'back', `**/routes/${fixture.richRouteId}/ascents/add`, onFormScreen(page))
  await expectOffset(page, onForm, 'the form keeps its own offset')

  await hop(page, 'back', `**/routes/${fixture.richRouteId}`, onRouteScreen(page))
  await expectOffset(page, onRoute, 'the route keeps its own, different offset')

  // Two entries that happened to share an offset would pass the pair above without telling the
  // entries apart at all.
  expect(onForm).not.toBe(onRoute)
})

/**
 * The risk the design names: rows arrive after the route renders, so the container is short when the
 * restore first writes and the browser clamps it. A reload is what makes that deterministic here,
 * since it drops the client store and the route's rows have to arrive again on the way back. Kit
 * persists snapshots to `sessionStorage`, so the offset itself survives the reload.
 *
 * Not the explore block screen, which was the obvious candidate and is the wrong one: at this width
 * it renders in the bottom sheet rather than the layout's `main`, and a sheet resets rather than
 * restores.
 */
test('restores against a screen whose height arrives with the rows', async () => {
  const left = await openScrolled(page, `/routes/${fixture.richRouteId}`)

  await follow(page, /Log ascent/, `**/routes/${fixture.richRouteId}/ascents/add`)
  await page.reload()
  await expect(onFormScreen(page)).toBeVisible({ timeout: 30_000 })

  await hop(page, 'back', `**/routes/${fixture.richRouteId}`, onRouteScreen(page))

  await expectOffset(page, left, 'the screen is restored once its rows have arrived')
})
