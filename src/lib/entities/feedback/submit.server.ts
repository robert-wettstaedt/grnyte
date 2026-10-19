import { resolve } from '$app/paths'
import * as schema from '$lib/db/schema'
import { feedback } from '$lib/db/schema'
import { blank } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { feedbackSchema } from './dto'
import { feedbackExcerpt } from './mapper'
import { notifyAdminsOfFeedback } from './notify.server'

/**
 * Record a piece of feedback and tell the admins.
 *
 * Privileged: the table has RLS on with no policies, so the caller's session is the gate.
 */
export async function submitFeedbackRow(
  value: z.output<typeof feedbackSchema>,
  { afterCommit, db, user }: Pick<Context, 'afterCommit' | 'user'> & { db: PostgresJsDatabase<typeof schema> },
  origin: string,
) {
  const [created] = await db
    .insert(feedback)
    .values({
      body: value.body,
      createdBy: user.id,
      kind: value.kind,
      locale: blank(value.locale),
      pathname: blank(value.pathname),
      userAgent: value.userAgent ?? null,
    })
    .returning({ id: feedback.id })

  // After commit, and never throws: a dead push or mail host cannot fail a report already recorded.
  afterCommit(() =>
    notifyAdminsOfFeedback({
      excerpt: feedbackExcerpt(value.body),
      feedbackFk: created.id,
      kind: value.kind,
      origin,
      pathname: value.pathname,
      username: user.username,
    }),
  )

  return { redirectTo: resolve('/(app)/settings') }
}
