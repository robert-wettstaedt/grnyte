import { getRequestEvent, query } from '$app/server'
import { env } from '$env/dynamic/private'
import { env as publicEnv } from '$env/dynamic/public'
import * as z from '$lib/forms/zod'
import { requireAppAdmin } from '$lib/remote/require.server'

const count = z.optional(z.nullable(z.number()))

/** The body `deployment/powersync/health.mjs` serves; only `status` and `reasons` when unreachable or unauthorized. */
const syncHealthSchema = z.object({
  errorCount: z.optional(z.number()),
  lagBytes: count,
  lastCheckpoint: z.optional(z.nullable(z.string())),
  // Open: the sidecar deploys apart from the app, and a reason this build does not know still carries a verdict.
  reasons: z.array(z.string()),
  safeWalSize: count,
  status: z.enum(['healthy', 'unhealthy', 'unreachable']),
  walStatus: z.optional(z.nullable(z.string())),
})

export type SyncHealth = z.infer<typeof syncHealthSchema>

const UNREACHABLE: SyncHealth = { reasons: ['unreachable'], status: 'unreachable' }

/** The sync service's health for app admins, through the sidecar nginx exposes at `/health/sync`. */
export const syncHealth = query(async (): Promise<SyncHealth> => {
  requireAppAdmin(getRequestEvent().locals.userPermissions)

  const url = env.SYNC_HEALTH_URL || `${publicEnv.PUBLIC_POWERSYNC_URL}/health/sync`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    // 200 and 503 both carry the sidecar's verdict; anything else (nginx's 502, a 404) did not reach it.
    if (response.status === 200 || response.status === 503) {
      const parsed = syncHealthSchema.safeParse(await response.json())
      if (parsed.success) return parsed.data
    }
  } catch {
    // Refused, timed out or not JSON.
  }
  return UNREACHABLE
})
