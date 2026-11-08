// GET /health/sync: PowerSync's diagnostics reduced to 200 or 503 and a few numbers, never the token, URIs or tables.
//
//   POWERSYNC_URL=http://localhost:58100 PS_ADMIN_TOKEN=local-admin PORT=58101 node deployment/powersync/health.mjs
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

// ~1000x the idle lag measured locally (a few hundred kB); past it the slot falls behind and WAL fills the capped disk.
export const MAX_LAG_BYTES = 256 * 1024 * 1024
// A checkpoint follows every Postgres keepalive (seconds apart), so ten minutes without one is a stalled replication.
export const MAX_CHECKPOINT_AGE_MS = 10 * 60 * 1000
// Well under nginx's 15 s and an uptime probe's own timeout, so a hung service reads as down rather than slow.
const DIAGNOSTICS_TIMEOUT_MS = 5000
// Below this the slot is about to lose WAL; prod's disk is capped, so max_slot_wal_keep_size is set.
export const MIN_SAFE_WAL_BYTES = 1024 ** 3
// One diagnostics call per window however often the public endpoint is hit.
export const CACHE_MS = 15_000

// A warning (ReplicationError's other level) passes on its own; a missing level counts as fatal.
const fatal = (errors) => (errors ?? []).filter((error) => (error?.level ?? 'fatal') === 'fatal')
const errorsOf = (items) => (items ?? []).flatMap((item) => fatal(item.errors))

export async function diagnose(url, token, now = Date.now) {
  try {
    const response = await fetch(`${url}/api/admin/v1/diagnostics`, {
      body: '{}',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(DIAGNOSTICS_TIMEOUT_MS),
    })
    if (response.status === 401 || response.status === 403) return { reasons: ['unauthorized'], status: 'unreachable' }
    if (response.ok) return verdict(await response.json(), now())
  } catch {
    // Refused, timed out or not JSON: all the same answer.
  }
  return { reasons: ['unreachable'], status: 'unreachable' }
}

export function healthServer(url, token, now = Date.now) {
  let cached
  return createServer(async (request, response) => {
    // Compared raw: `new URL()` throws on a path like `//[/../health/sync`.
    if (!['GET', 'HEAD'].includes(request.method ?? '') || request.url?.split('?')[0] !== '/health/sync') {
      response.writeHead(404).end()
      return
    }
    if (!cached || now() - cached.at >= CACHE_MS) cached = { at: now(), body: diagnose(url, token, now) }
    const body = await cached.body
    response
      .writeHead(body.status === 'healthy' ? 200 : 503, {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      })
      .end(JSON.stringify(body))
  })
}

/** The verdict for one diagnostics response. Assumes one replication connection, which is all the service has. */
export function verdict(diagnostics, now) {
  const rules = diagnostics?.data?.active_sync_rules ?? {}
  const connections = rules.connections ?? []
  const errorCount =
    errorsOf(diagnostics?.data?.connections).length +
    fatal(rules.errors).length +
    errorsOf(connections.flatMap((c) => c.tables ?? [])).length
  const {
    last_checkpoint_ts: lastCheckpoint = null,
    max_slot_wal_keep_size: keepSize = null,
    replication_lag_bytes: lagBytes = null,
    safe_wal_size: safeWalSize = null,
    wal_status: walStatus = null,
  } = connections[0] ?? {}
  // Postgres reports no safe_wal_size only when max_slot_wal_keep_size is unset (-1).
  const walCapped = keepSize != null && keepSize !== -1

  const failed = {
    // Negated so a missing or unparseable time (NaN) reads as stale.
    checkpoint: !(now - Date.parse(lastCheckpoint) <= MAX_CHECKPOINT_AGE_MS),
    errors: errorCount > 0,
    lag: lagBytes == null || lagBytes > MAX_LAG_BYTES,
    wal: !['extended', 'reserved'].includes(walStatus),
    walHeadroom: safeWalSize == null ? walCapped : safeWalSize < MIN_SAFE_WAL_BYTES,
  }
  const reasons = Object.keys(failed).filter((reason) => failed[reason])

  return {
    errorCount,
    lagBytes,
    lastCheckpoint,
    reasons,
    safeWalSize,
    status: reasons.length === 0 ? 'healthy' : 'unhealthy',
    walStatus,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { PORT = '8080', POWERSYNC_URL = 'http://powersync-prod:8080', PS_ADMIN_TOKEN } = process.env
  if (!PS_ADMIN_TOKEN) throw new Error('PS_ADMIN_TOKEN is not set')

  healthServer(POWERSYNC_URL, PS_ADMIN_TOKEN).listen(Number(PORT), () =>
    console.log(`sync health on :${PORT} for ${new URL(POWERSYNC_URL).host}`),
  )
}
