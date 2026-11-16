import { receiveAppleNotification } from '$lib/auth/oauth/appleSignInEvents.server'
import type { RequestHandler } from './$types'

/** Sign in with Apple's account notifications. Registered at Apple, so this path never moves; the JWS is the only authorization. */
export const POST: RequestHandler = async ({ request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 400 })
  }
  try {
    return new Response(null, { status: await receiveAppleNotification(body) })
  } catch (cause) {
    // The database failed past the one deadlock retry: 503, so a sender that retries can. The code only: drizzle's
    // error carries the query's parameters, which hold the person's address.
    const { cause: inner } = (cause ?? {}) as { cause?: { code?: string } }
    console.error('[apple-notification] not applied', inner?.code ?? (cause as Error)?.name)
    return new Response(null, { status: 503 })
  }
}
