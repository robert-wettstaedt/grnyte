import { pinnedTx } from '$lib/db/pinned.server'
import { notifications, regions, users, userSettings } from '$lib/db/schema'
import { membershipRemovedEmailContent, roleChangedEmailContent } from '$lib/email/membership'
import { sendEmailOutcome, type SendOutcome } from '$lib/email/send.server'
import type { EmailContent } from '$lib/email/shell'
import { objectOf } from '$lib/entities/event/dto'
import { roleLabelFor } from '$lib/entities/rolePermission/mapper'
import { contactLocale, resolveMessage } from '$lib/i18n/message'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { logServerFailure } from '$lib/logging/failure.server'
import type { Locale } from '$lib/paraglide/runtime'
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'
import { notificationView } from './caption'
import { toMs, unreadCounts } from './delivery.server'
import { directedWanted, inBatches, parentNameIn, pathnameFor, type ParentName } from './dispatch'
import type { NotificationSourceType } from './dto'
import { readableRegions } from './notification.server'
import { DIRECTED_DEBOUNCE_MS, DIRECTED_SCAN_LIMIT, directedTag } from './push'
import { sendPushToUser, subscriptionsFor } from './push.server'
import { sourceTraits } from './sourceType'

type MailBuilder = (
  row: { actorName: string; metadata: null | string; regionName: string },
  locale: Locale,
  url: string,
) => EmailContent

/**
 * Deliver one directed row, and let a bad one fail alone. `inBatches` is a bare `Promise.all`, so
 * one rejection takes down `sendDirected` before it can stamp anything, and every push already
 * sent this run goes out again on the next tick. Same guard `sendDigests` has.
 */
async function guarded(id: number, task: () => Promise<boolean | void>): Promise<boolean> {
  try {
    return (await task()) === true
  } catch (error) {
    // Console only: this runs every five minutes and a row that fails keeps failing, so recording
    // it would be one entry per tick. The row is still in the inbox, which is the durable half.
    console.error(`[notifications] directed row ${id} failed`, error)
    return false
  }
}

/**
 * The source types that also go out as email: the role you hold, and the access you no longer
 * have. Unconditional, ignoring the six push switches, which govern push and nothing else.
 *
 * `invitation_received` is deliberately absent: the invitation mail has already gone out, carries
 * the token, and reaches addresses with no account at all.
 */
const MAIL: Partial<Record<NotificationSourceType, MailBuilder>> = {
  membership_removed: (row, locale, url) => membershipRemovedEmailContent({ locale, regionName: row.regionName, url }),
  role_changed: (row, locale, url) =>
    roleChangedEmailContent({
      actor: row.actorName,
      locale,
      regionName: row.regionName,
      role: roleLabelFor(row.metadata ?? undefined, { locale }),
      url,
    }),
}

const MAILED = new Set(Object.keys(MAIL) as NotificationSourceType[])

/** Directed rows claimed and sent per step; see `dispatchSlice`. */
const CLAIM_SLICE = 100

/** How long a mail that failed is retried before its row is stamped anyway. */
const MAIL_RETRY_MS = DAY_MS

/**
 * Directed pushes: one per unread row past its debounce.
 *
 * `readAt IS NULL` is re-read here rather than trusted from when the row was written, and it is
 * what stops a push arriving for something the reader already saw in-app. `pushedAt` is stamped
 * whether or not a device took it, so a person with no working subscription does not accumulate a
 * backlog that fires the day they subscribe.
 */
export async function sendDirected(nowMs: number, origin: string, pushConfigured: boolean): Promise<number> {
  // `notifications` joins `users` twice over (the recipient carries the settings, the actor
  // carries the name), so the actor side needs an alias of its own.
  const actor = alias(users, 'actor')

  const dispatchable = await pinnedTx((tx) =>
    tx
      .select({
        actorName: actor.username,
        areaFk: notifications.areaFk,
        ascentFk: notifications.ascentFk,
        blockFk: notifications.blockFk,
        contactLocale: userSettings.contactLocale,
        createdAt: notifications.createdAt,
        // Where the mail goes. `auth.users` is the only place an address lives.
        email: authUsers.email,
        // Both only so the push can open where it happened rather than on the inbox. See
        // `pathnameFor`.
        eventFk: notifications.eventFk,
        fileFk: notifications.fileFk,
        id: notifications.id,
        metadata: notifications.metadata,
        notifyComments: userSettings.notifyComments,
        notifyDirected: userSettings.notifyDirected,
        notifyReactions: userSettings.notifyReactions,
        reactionFk: notifications.reactionFk,
        regionFk: notifications.regionFk,
        // The place, for the two sentences that say it: a push and a mail have no crumb to draw it
        // from the way the inbox does.
        regionName: regions.name,
        routeFk: notifications.routeFk,
        sourceType: notifications.sourceType,
        subjectFk: notifications.subjectFk,
        userFk: notifications.userFk,
      })
      .from(notifications)
      .innerJoin(actor, eq(actor.id, notifications.actorFk))
      .innerJoin(regions, eq(regions.id, notifications.regionFk))
      .leftJoin(authUsers, eq(authUsers.id, notifications.authUserFk))
      .leftJoin(userSettings, eq(userSettings.userFk, notifications.userFk))
      .where(
        and(
          isNull(notifications.pushedAt),
          isNull(notifications.readAt),
          lte(notifications.createdAt, new Date(nowMs - DIRECTED_DEBOUNCE_MS)),
          // Without push, only what could be mailed: stamping the rest would burn a backlog that
          // adding VAPID later would never deliver.
          pushConfigured ? undefined : inArray(notifications.sourceType, [...MAILED]),
        ),
      )
      .orderBy(asc(notifications.createdAt), asc(notifications.id))
      .limit(DIRECTED_SCAN_LIMIT),
  )

  if (dispatchable.length === 0) {
    return 0
  }

  // One slice at a time, each claimed only once the last is done: a run cut short (a function
  // timeout) loses one slice rather than all it claimed, and a claim stays inside the bind limit.
  const dispatchSlice = async (slice: typeof dispatchable): Promise<number> => {
    // Claimed before anything is sent, so two overlapping runs (a slow one, a second instance) never
    // both send a row. Matched on `created_at` too: a row re-armed since the read is a new delivery.
    const claimedAt = new Date()
    const claimedIds = await pinnedTx((tx) =>
      tx
        .update(notifications)
        .set({ pushedAt: claimedAt })
        .where(
          and(
            isNull(notifications.pushedAt),
            or(
              ...slice.map((row) =>
                and(
                  eq(notifications.id, row.id),
                  sql`${toMs(notifications.createdAt)} = ${row.createdAt.toISOString()}::timestamptz`,
                ),
              ),
            ),
          ),
        )
        .returning({ id: notifications.id }),
    )
    const claimed = new Set(claimedIds.map((row) => row.id))
    const ready = slice.filter((row) => claimed.has(row.id))

    // Mail first, and outside the push pass below, which filters by the six switches and by
    // `region.read`. Both are push concepts. Inside it, somebody who muted push and was then removed
    // from a region had their row stamped delivered with nothing sent on either channel.
    const allMailed = ready.filter((row) => MAILED.has(row.sourceType))
    const mailOutcomes = await inBatches(allMailed, (row) =>
      sendMembershipEmail(row, contactLocale(row.contactLocale), origin).catch((error: unknown) => {
        console.error(`[notifications] directed row ${row.id} failed`, error)
        // The SDK reports network trouble rather than throwing, so a throw is a fault that would repeat.
        return 'failed' as const
      }),
    )
    // Only a mail that could go out next time holds its row (and its push) back, for a day at most.
    const retrying = new Set(
      allMailed
        .filter((row, i) => mailOutcomes[i] === 'retry' && nowMs - row.createdAt.getTime() < MAIL_RETRY_MS)
        .map((row) => row.id),
    )
    const gaveUp = allMailed.filter((row, i) => mailOutcomes[i] === 'retry' && !retrying.has(row.id))
    if (gaveUp.length > 0) {
      await logServerFailure('notifications', `gave up mailing rows ${gaveUp.map((row) => row.id).join(', ')}`)
    }
    if (retrying.size > 0) {
      // Handed back for the next run; only this run's claim, so a later re-arm is left alone.
      await pinnedTx((tx) =>
        tx
          .update(notifications)
          .set({ pushedAt: null })
          .where(and(inArray(notifications.id, [...retrying]), eq(notifications.pushedAt, claimedAt))),
      )
    }
    const deliverable = ready.filter((row) => !retrying.has(row.id))

    // Everything below is the push pass, and all of it (three queries before a payload is built)
    // is dead work without keys to sign with.
    let sent = 0

    if (pushConfigured) {
      const wanted = deliverable.filter(directedWanted)

      // The same re-check the digest half makes, for the same reason. A member removed from the
      // region (or whose role lost `region.read`) between the fan-out and now would otherwise be
      // pushed the name of a route they can no longer open, and find an empty inbox when they tap
      // it: the row's own SELECT policy requires that permission, so it is hidden from the reader
      // it names.
      const regionsByUser = await readableRegions(wanted.map((row) => row.userFk))
      // Exempt for the queue-only pair, whose recipient is outside the region by definition. Their
      // sentence names it in the copy rather than linking into it.
      const readable = wanted.filter(
        (row) =>
          sourceTraits(row.sourceType).queueOnly || regionsByUser.get(row.userFk)?.includes(row.regionFk) === true,
      )

      const subscriptions = await subscriptionsFor(readable.map((row) => row.userFk))
      const unread = await unreadCounts(readable.map((row) => row.userFk))
      // Only the rows that name a file, so a batch without one runs no extra query.
      const parents = await parentNamesOf(readable.flatMap((row) => (row.fileFk == null ? [] : [row.fileFk])))

      const results = await inBatches(readable, (row) =>
        guarded(row.id, () => {
          const locale = contactLocale(row.contactLocale)
          // The parent's page with the viewer open, for the same reason the inbox row uses it: a
          // push that opens the share page strands the reader outside the app.
          const parent = row.fileFk == null ? undefined : parents.get(row.fileFk)
          const view = notificationView(
            {
              actorName: row.actorName,
              metadata: row.metadata ?? undefined,
              // The same derivation the inbox makes: whichever typed column is set says what the
              // row is about. The push only needs it for the sentence, which never asks what type
              // it was.
              object: objectOf(row),
              // A push has no entity row to name the place, so the title says it.
              objectName: parentNameIn(parent, locale),
              regionName: row.regionName,
              sourceType: row.sourceType,
            },
            { locale },
          )

          return sendPushToUser(subscriptions, row.userFk, {
            badge: unread.get(row.userFk) ?? 0,
            // Straight to where it happened when the row knows: a comment, a reply, a mention
            // inside one and an emoji all name their card, and the card's page renders the thread
            // with the line anchored.
            pathname: parent == null || row.fileFk == null ? pathnameFor(row) : `${parent.path}?media=${row.fileFk}`,
            tag: directedTag(row.id),
            title: resolveMessage(view.key, view.params, { locale }),
          })
        }),
      )

      sent = results.filter(Boolean).length
    }

    // Read at send, for the queue-only rows alone: nobody can open them, so left unread they would
    // sit in `unreadCounts` for 90 days behind a badge that never clears. The stamp is the claim:
    // every dispatched row keeps it, sent or not, so an offline device builds no queue.
    const delivered = deliverable.filter((row) => sourceTraits(row.sourceType).queueOnly).map((row) => row.id)

    if (delivered.length > 0) {
      await pinnedTx((tx) =>
        tx.update(notifications).set({ readAt: new Date() }).where(inArray(notifications.id, delivered)),
      )
    }

    return sent
  }

  let total = 0
  for (let start = 0; start < dispatchable.length; start += CLAIM_SLICE) {
    total += await dispatchSlice(dispatchable.slice(start, start + CLAIM_SLICE))
  }
  return total
}

/**
 * The parents of the files a batch of `video_ready` rows name.
 *
 * Its own query rather than five joins on the directed select: every other source type would carry
 * the cost of relations only this one ever sets. Minted per recipient rather than here, because
 * `blockName`'s fallback is localised and one file can be pushed to several people.
 */
async function parentNamesOf(fileFks: readonly string[]): Promise<Map<string, ParentName>> {
  const ids = [...new Set(fileFks)]
  if (ids.length === 0) {
    return new Map()
  }

  const rows = await pinnedTx((tx) =>
    tx.query.files.findMany({
      columns: { areaFk: true, blockFk: true, id: true, routeFk: true },
      where: (table, { inArray: within }) => within(table.id, ids),
      with: {
        area: { columns: { name: true } },
        ascent: { columns: { id: true }, with: { route: { columns: { id: true, name: true } } } },
        block: { columns: { name: true, order: true } },
        route: { columns: { name: true } },
      },
    }),
  )

  return new Map(
    rows.flatMap((row): [string, ParentName][] => {
      if (row.routeFk != null && row.route != null) {
        return [[row.id, { kind: 'plain', name: row.route.name ?? '', path: `/routes/${row.routeFk}` }]]
      }
      if (row.ascent?.route != null) {
        const route = row.ascent.route
        return [[row.id, { kind: 'plain', name: route.name ?? '', path: `/routes/${route.id}` }]]
      }
      if (row.blockFk != null && row.block != null) {
        return [
          [
            row.id,
            { kind: 'block', name: row.block.name ?? '', order: row.block.order, path: `/blocks/${row.blockFk}` },
          ],
        ]
      }
      if (row.areaFk != null && row.area != null) {
        return [[row.id, { kind: 'plain', name: row.area.name ?? '', path: `/areas/${row.areaFk}` }]]
      }
      return []
    }),
  )
}

/**
 * The membership half of a directed row, as mail. A no-op for everything else, so adding a source
 * type to {@link MAIL} with its content is the whole change.
 *
 * The role label is resolved here rather than read off the view, which folds it into a sentence
 * while the mail needs it as a value. `roleLabelFor` rather than `roleLabel`: the string came out
 * of storage, and a retired role must fall back to the plain sentence, not read as a promotion.
 */
async function sendMembershipEmail(
  row: {
    actorName: string
    createdAt: Date
    email: null | string
    id: number
    metadata: null | string
    regionName: string
    sourceType: NotificationSourceType
  },
  locale: Locale,
  origin: string,
): Promise<SendOutcome> {
  // Nothing to send counts as done, so the row is stamped rather than retried.
  const build = MAIL[row.sourceType]
  if (build == null || row.email == null) {
    return 'sent'
  }

  const content = build(row, locale, origin)

  return sendEmailOutcome(
    {
      ...content,
      // The row AND the delivery it belongs to. A row is re-armed rather than replaced when the same
      // thing happens again (see the `onConflictDoUpdate` in `notify`), so the id alone would let
      // Resend swallow a second, genuinely different role change as a duplicate of the first.
      // `created_at` is reset by that re-arm and is stable across cron retries of one delivery.
      idempotencyKey: `notification-${row.id}-${row.createdAt.getTime()}`,
      locale,
      origin,
      template: `notification-${row.sourceType}`,
      to: row.email,
    },
    // Retried every tick for a day; `sendDirected` logs once when it gives up.
    { quietRetry: true },
  )
}
