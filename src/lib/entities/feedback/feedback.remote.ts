import { resolve } from '$app/paths'
import { command, form, getRequestEvent, query } from '$app/server'
import { pinnedTx } from '$lib/db/pinned.server'
import { feedback, users, userSettings } from '$lib/db/schema'
import { feedbackReplyEmailContent } from '$lib/email/feedback'
import { sendEmailOutcome } from '$lib/email/send.server'
import { blank, formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { contactLocale } from '$lib/i18n/message'
import { requireAuthed } from '$lib/remote/authed.server'
import { requireAppAdmin } from '$lib/remote/require.server'
import { error as httpError } from '@sveltejs/kit'
import { and, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'
import { createHash } from 'node:crypto'
import { feedbackKind, type FeedbackItem } from './dto'
import { feedbackExcerpt } from './mapper'
import { notifyAdminsOfFeedback } from './notify.server'

// `auth.users` and `public.users` are both named "users": joining them unaliased fails only at
// runtime (42P09), invisible to the typechecker. Same alias as `notify.server.ts`/`signup.server.ts`.
const authUser = alias(authUsers, 'auth_user')

const BODY_MIN = 10
const BODY_MAX = 5000

const feedbackSchema = z.object({
  body: z
    .string({ error: formError('form_required') })
    .check(
      z.trim(),
      z.minLength(BODY_MIN, { error: formError('form_charsMin', { count: BODY_MIN }) }),
      z.maxLength(BODY_MAX, { error: formError('form_charsMax', { count: BODY_MAX }) }),
    ),
  kind: z.enum(feedbackKind, { error: formError('form_required') }),
  // Captured by the page, so a missing value is not an error.
  locale: z._default(z.optional(z.string().check(z.maxLength(16))), ''),
  pathname: z._default(z.optional(z.string().check(z.maxLength(2048))), ''),
})

/**
 * Record a piece of feedback and tell the admins.
 *
 * Plain `form`, not `authedForm`: the table has RLS on with no policies, so the write runs on the
 * privileged handle and `requireAuthed` is the gate. `createdBy` and `user_agent` come from the
 * session and the request, never from the payload.
 */
export const submitFeedback = form(feedbackSchema, async (value) => {
  const { request, url } = getRequestEvent()
  const { user } = requireAuthed()

  const [created] = await pinnedTx((tx) =>
    tx
      .insert(feedback)
      .values({
        body: value.body,
        createdBy: user.id,
        kind: value.kind,
        locale: blank(value.locale),
        pathname: blank(value.pathname),
        userAgent: request.headers.get('user-agent'),
      })
      .returning({ id: feedback.id }),
  )

  // Last, after the row exists, and never throws: a dead push or mail host cannot fail a report
  // that is already recorded.
  await notifyAdminsOfFeedback({
    excerpt: feedbackExcerpt(value.body),
    feedbackFk: created.id,
    kind: value.kind,
    origin: url.origin,
    pathname: value.pathname,
    username: user.username,
  })

  // A plain `form`, so this is read off the result rather than becoming a 303.
  return { redirectTo: resolve('/(app)/settings') }
})

/**
 * Every submission, newest first, for app admins. Ungrouped and unpaged unlike the error log:
 * collapsing two rows would hide a person waiting for an answer.
 */
export const listFeedback = query(async (): Promise<FeedbackItem[]> => {
  const { locals } = getRequestEvent()

  requireAppAdmin(locals.userPermissions)

  const rows = await pinnedTx((tx) =>
    tx
      .select({
        authorName: users.username,
        body: feedback.body,
        createdAt: feedback.createdAt,
        id: feedback.id,
        kind: feedback.kind,
        locale: feedback.locale,
        pathname: feedback.pathname,
        repliedAt: feedback.repliedAt,
        reply: feedback.reply,
        status: feedback.status,
        userAgent: feedback.userAgent,
      })
      .from(feedback)
      .innerJoin(users, eq(users.id, feedback.createdBy))
      // `'closed' < 'open'` lexicographically, so DESC puts unanswered rows on top, then newest.
      .orderBy(desc(feedback.status), desc(feedback.createdAt))
      // ponytail: newest 200, no paging. The sort above is what makes that safe: only closed rows
      // fall off the cap. Add paging the day 200 open reports is a real week.
      .limit(200),
  )

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.getTime(),
    locale: row.locale ?? '',
    pathname: row.pathname ?? '',
    repliedAt: row.repliedAt?.getTime(),
    reply: row.reply ?? '',
    userAgent: row.userAgent ?? '',
  }))
})

/**
 * Answer a submission: mail the reply to its author and close the row.
 *
 * The mail is the delivery, not a nudge towards an in-app inbox: over 90% of accounts have no push
 * subscription.
 */
export const replyToFeedback = command(
  z.object({
    id: z.number(),
    reply: z
      .string({ error: formError('form_required') })
      .check(z.trim(), z.minLength(1, { error: formError('form_required') }), z.maxLength(BODY_MAX)),
  }),
  async ({ id, reply }) => {
    const { locals, url } = getRequestEvent()

    requireAppAdmin(locals.userPermissions)

    const stampedAt = new Date()

    // Privileged handle: neither `auth.users` nor `user_settings` is readable by `authenticated`,
    // and the recipient is not the caller.
    const row = await pinnedTx(async (tx) => {
      const [found] = await tx
        .select({
          body: feedback.body,
          email: authUser.email,
          locale: userSettings.contactLocale,
        })
        .from(feedback)
        .innerJoin(users, eq(users.id, feedback.createdBy))
        .innerJoin(authUser, eq(authUser.id, users.authUserFk))
        // LEFT: an author with no settings row is still answered, in the default language.
        .leftJoin(userSettings, eq(userSettings.userFk, users.id))
        .where(eq(feedback.id, id))
        .limit(1)

      if (found == null) {
        httpError(404, formError('feedback_notFound'))
      }

      // The UPDATE is the gate, not a check before it: a separate read-then-check leaves a window
      // where two admins both pass and the second overwrites the first.
      // Closed before the send so two admins cannot both mail; reopened below if the send fails.
      const [updated] = await tx
        .update(feedback)
        .set({ repliedAt: stampedAt, reply, status: 'closed' })
        .where(and(eq(feedback.id, id), eq(feedback.status, 'open')))
        .returning({ id: feedback.id })

      if (updated == null) {
        httpError(409, formError('feedback_alreadyAnswered'))
      }

      return found
    })

    // No address to answer: the row is still closed and the text stored, but do not let the inbox
    // report a delivery that was never attempted.
    if (row.email == null) {
      return { delivered: false }
    }

    const locale = contactLocale(row.locale)

    const outcome = await sendEmailOutcome({
      ...feedbackReplyEmailContent({ locale, original: row.body, reply, url: url.origin }),
      // Per reply text: a retry of the same answer after a send that did go out stays one mail, and
      // an edited one is a new mail (Resend refuses a reused key with a different body).
      idempotencyKey: `feedback-reply-${id}-${createHash('sha256').update(reply).digest('hex').slice(0, 16)}`,
      locale,
      origin: url.origin,
      template: 'feedback-reply',
      to: row.email,
    })

    // Reopened only when a resend could succeed, matched on the stamp to spare a concurrent answer.
    if (outcome === 'retry') {
      await pinnedTx((tx) =>
        tx
          .update(feedback)
          .set({ repliedAt: null, status: 'open' })
          .where(and(eq(feedback.id, id), eq(feedback.repliedAt, stampedAt))),
      )
    }

    return { delivered: outcome === 'sent' }
  },
)
