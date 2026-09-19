// @vitest-environment node
import { db } from '$lib/db/db.server'
import { clientErrorLogs } from '$lib/db/schema'
import { reachable, sql } from '$lib/db/testDb'
import { and, desc, eq, gt, like } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { ERROR_LOG_MAX_AGE_DAYS, logServerFailure } from './failure.server'
import { MAX_ERROR_LENGTH } from './stringify'

/** Unique per run, so a parallel suite's rows are never read or deleted by this one. */
const scope = `test-${crypto.randomUUID()}`

/** Scoped as well as watermarked: the watermark alone lets a parallel server suite's row through,
 *  and this file and `push.server.test.ts` both write server rows to the one dev database. */
const written = async (afterId: number) =>
  db
    .select()
    .from(clientErrorLogs)
    .where(
      and(
        eq(clientErrorLogs.source, 'server'),
        gt(clientErrorLogs.id, afterId),
        like(clientErrorLogs.error, `[${scope}]%`),
      ),
    )

const watermark = async () => {
  const [row] = await db.select({ id: clientErrorLogs.id }).from(clientErrorLogs).orderBy(desc(clientErrorLogs.id))
  return row?.id ?? 0
}

afterAll(async () => {
  if (reachable) {
    await db.delete(clientErrorLogs).where(like(clientErrorLogs.error, `[${scope}]%`))
  }
  await sql.end()
})

describe.skipIf(!reachable)('logServerFailure', () => {
  it('records the reason under its scope, as a server row', async () => {
    const before = await watermark()

    await logServerFailure(scope, 'the cron could not reach the push service')

    const rows = await written(before)
    expect(rows).toHaveLength(1)
    expect(rows[0].error).toBe(`[${scope}] the cron could not reach the push service`)
    expect(rows[0].source).toBe('server')
  })

  // The crons restate a condition that has not changed on every tick, one of them every five
  // minutes, so an undeduped recorder is 288 identical rows a day per stuck thing.
  it('records an identical message once inside the window', async () => {
    const before = await watermark()

    await logServerFailure(scope, 'the same thing failed again')
    await logServerFailure(scope, 'the same thing failed again')
    await logServerFailure(scope, 'the same thing failed again')

    expect(await written(before)).toHaveLength(1)
  })

  // What keeps two stuck devices from reading as one: the caller puts the id in the message.
  it('keeps messages that differ', async () => {
    const before = await watermark()

    await logServerFailure(scope, 'send rejected 401 (device 1)')
    await logServerFailure(scope, 'send rejected 401 (device 2)')

    expect(await written(before)).toHaveLength(2)
  })

  // Nothing in the database enforces this: `error` is `text`, and a 20k reason inserts happily.
  // The cap is ours, so one runaway reason cannot fill the table.
  it('truncates a reason past the column cap', async () => {
    const before = await watermark()

    await logServerFailure(scope, 'x'.repeat(MAX_ERROR_LENGTH * 2))

    const rows = await written(before)
    expect(rows).toHaveLength(1)
    expect(rows[0].error).toHaveLength(MAX_ERROR_LENGTH)
  })
})

/**
 * The retention figure is a promise to the reader, not a tuning knob: the notice publishes it in
 * two places per locale, and nothing but this stops the constant drifting away from either.
 *
 * Asserted per SECTION rather than over the whole file: `toContain` alone passes while section 7
 * says 180 and 2.6 still says 90, which is the drift most worth catching.
 */
describe('published retention', () => {
  const read = (locale: string) => readFileSync(`src/routes/(landing)/legal/privacy/privacy.${locale}.html`, 'utf8')

  /** The 2.6 block, from its heading to the next one. */
  const section26 = (html: string) => html.slice(html.indexOf('2.6'), html.indexOf('2.7'))

  /** The retention list item, from the term to the end of its `<li>`. */
  const retentionItem = (html: string, term: string) => {
    const start = html.indexOf(term)
    return html.slice(start, html.indexOf('</li>', start))
  }

  it.each([
    ['en', `${ERROR_LOG_MAX_AGE_DAYS} days`, 'error reports:'],
    ['de', `${ERROR_LOG_MAX_AGE_DAYS} Tage`, 'Fehlerberichte:'],
  ])('is stated in both places of the %s notice', (locale, figure, term) => {
    const html = read(locale)

    expect(section26(html)).toContain(figure)
    expect(retentionItem(html, term)).toContain(figure)
  })
})
