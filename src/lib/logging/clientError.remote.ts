import { command, getRequestEvent } from '$app/server'
import { db } from '$lib/db/db.server'
import { clientErrorLogs } from '$lib/db/schema'
import z from 'zod'

// Persists a client-side error. Deliberately not `authedCommand`: errors can happen
// logged-out, and the table has RLS on with no insert policy — so we use the
// privileged db client and take `createdBy` from the server session, never the client.
// ponytail: open endpoint with a capped payload; add rate-limiting if it gets abused.
export const logClientError = command(
  z.object({
    error: z.string().max(10_000),
    pathname: z.string().max(2048).optional(),
    navigator: z.json().optional(),
  }),
  async ({ error, pathname, navigator }) => {
    const { locals } = getRequestEvent()

    await db.insert(clientErrorLogs).values({
      createdBy: locals.user?.id ?? null,
      error,
      navigator: navigator ?? null,
      pathname: pathname ?? null,
    })
  },
)
