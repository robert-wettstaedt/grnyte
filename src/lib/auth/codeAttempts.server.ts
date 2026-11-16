import { pinnedTx } from '$lib/db/pinned.server'
import type * as schema from '$lib/db/schema'
import { authCodeAttempts } from '$lib/db/serverOnly'
import { and, eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/** The GoTrue code type being guessed. */
export type CodeKind = 'email_change' | 'recovery' | 'signup'
type CounterKind = 'already_has_account' | 'reauth_issue' | CodeKind

/** Tries allowed per window; the next one is refused. */
export const MAX_TRIES = 5

const WINDOW: Record<CounterKind, string> = {
  already_has_account: '60 seconds',
  email_change: '10 minutes',
  reauth_issue: '1 hour',
  recovery: '10 minutes',
  signup: '10 minutes',
}

export async function clearCodeTries(email: string, kind: CodeKind): Promise<void> {
  await pinnedTx((tx) =>
    tx
      .delete(authCodeAttempts)
      .where(and(eq(authCodeAttempts.subject, email.toLowerCase()), eq(authCodeAttempts.kind, kind))),
  )
}

/** Counts one try in a fixed window that starts at the first; a refused try never moves it. */
export async function countTry(
  tx: PostgresJsDatabase<typeof schema>,
  subject: string,
  kind: CounterKind,
): Promise<number> {
  const expired = sql`${authCodeAttempts.windowStartedAt} < now() - ${WINDOW[kind]}::interval`
  const [row] = await tx
    .insert(authCodeAttempts)
    .values({ kind, subject, tries: 1 })
    .onConflictDoUpdate({
      set: {
        tries: sql`case when ${expired} then 1 else ${authCodeAttempts.tries} + 1 end`,
        windowStartedAt: sql`case when ${expired} then now() else ${authCodeAttempts.windowStartedAt} end`,
      },
      target: [authCodeAttempts.subject, authCodeAttempts.kind],
    })
    .returning({ tries: authCodeAttempts.tries })
  return row.tries
}

/** Counts a guess before GoTrue is asked; false when any kind is past {@link MAX_TRIES}. */
export async function takeCodeTry(email: string, kinds: CodeKind[]): Promise<boolean> {
  const subject = email.toLowerCase()
  return pinnedTx(async (tx) => {
    let allowed = true
    for (const kind of kinds) {
      if ((await countTry(tx, subject, kind)) > MAX_TRIES) allowed = false
    }
    return allowed
  })
}
