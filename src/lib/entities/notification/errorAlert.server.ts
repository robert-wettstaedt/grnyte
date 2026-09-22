/** Tell whoever runs the app about error-log messages nobody has seen yet. Not a `notifications`
 *  row: those need a `region_fk` (see `feedback` in `schema.ts`), and Zero syncs them to clients. */
import { pinnedTx } from '$lib/db/pinned.server'
import { clientErrorLogs } from '$lib/db/schema'
import { m } from '$lib/paraglide/messages'
import { and, asc, isNull, lte, notLike } from 'drizzle-orm'
import { alertAppAdmins } from './adminAlert.server'

/** How many messages the alert names. The errors page holds the rest. */
const NAMED = 3

/** How much of a message the alert shows. The first line names the fault, the stack does not. */
const EXCERPT = 80

/** Rows per run. `logClientError` is an open endpoint, so the backlog is not ours to bound. */
const BATCH = 500

/** `alertAppAdmins` logs its own failures here, and mails them under `admin-alert-`. Both are
 *  excluded, so an alert that fails cannot become the next run's alert. */
const SELF = '[adminAlert]%'
const SELF_MAIL = '[email]%admin-alert-%'

/** Alert once per run on every message with an unalerted row. Grouped by message, so the two
 *  dedupes upstream mean a fault that keeps happening alerts about once a day. */
export async function alertOnNewErrors(origin: string): Promise<number> {
  try {
    const unseen = and(
      isNull(clientErrorLogs.alertedAt),
      notLike(clientErrorLogs.error, SELF),
      notLike(clientErrorLogs.error, SELF_MAIL),
    )

    const fresh = await pinnedTx(async (tx) => {
      const rows = await tx
        .select({ error: clientErrorLogs.error, id: clientErrorLogs.id })
        .from(clientErrorLogs)
        .where(unseen)
        .orderBy(asc(clientErrorLogs.id))
        .limit(BATCH)

      if (rows.length === 0) {
        return rows
      }

      // Before the send, not after: `alertAppAdmins` swallows its own failures, so an unstamped row
      // comes back every five minutes. By predicate, not by id list, which binds one parameter each
      // and throws past 65535; `lte` bounds it to what this run actually read.
      await tx
        .update(clientErrorLogs)
        .set({ alertedAt: new Date() })
        .where(and(unseen, lte(clientErrorLogs.id, rows[rows.length - 1].id)))

      return rows
    })

    if (fresh.length === 0) {
      return 0
    }

    const messages = [...new Set(fresh.map((row) => row.error ?? ''))]

    const excerpt = messages
      .slice(0, NAMED)
      .map((message) => message.split('\n')[0].slice(0, EXCERPT))
      .join(' · ')

    await alertAppAdmins({
      email: ({ at, locale }) => {
        const title = m.push_errorAlertTitle({ count: messages.length }, at)

        return {
          body: [m.email_errorAlertBody({ count: messages.length, excerpt }, at)],
          footerReason: 'account',
          locale,
          meta: m.email_errorAlertMeta({}, at),
          origin,
          preheader: m.email_errorAlertPreheader({}, at),
          subject: title,
          title,
        }
      },
      label: 'errorLogs',
      // One tag, so a newer alert replaces an unread one instead of stacking beside it.
      // ACCEPTED: `logClientError` is open, so an excerpt can be text a stranger chose.
      push: ({ at }) => ({
        body: excerpt,
        pathname: '/settings/errors',
        tag: 'error-alert',
        title: m.push_errorAlertTitle({ count: messages.length }, at),
      }),
    })

    return messages.length
  } catch (exception) {
    console.error('[errorAlert] failed', exception)
    return 0
  }
}
