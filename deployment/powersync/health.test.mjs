// @vitest-environment node
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  CACHE_MS,
  diagnose,
  healthServer,
  MAX_CHECKPOINT_AGE_MS,
  MAX_LAG_BYTES,
  MIN_SAFE_WAL_BYTES,
  verdict,
} from './health.mjs'

const NOW = Date.parse('2026-11-08T12:00:00Z')

/** The shape the local 1.27.2 service answers, healthy. */
const diagnostics = ({ connection = {}, ruleErrors = [], sourceErrors = [], tableErrors = [] } = {}) => ({
  data: {
    active_sync_rules: {
      connections: [
        {
          last_checkpoint_ts: new Date(NOW - 5000).toISOString(),
          max_slot_wal_keep_size: 4_294_967_296,
          replication_lag_bytes: 96,
          safe_wal_size: 4_298_026_312,
          tables: [
            { errors: [], name: 'grades' },
            { errors: tableErrors, name: 'routes' },
          ],
          wal_status: 'reserved',
          ...connection,
        },
      ],
      errors: ruleErrors,
    },
    connections: [{ errors: sourceErrors, postgres_uri: 'postgresql://supabase-db:5432/postgres' }],
  },
})

const error = { level: 'fatal', message: 'boom' }
const warning = { level: 'warning', message: 'slow' }

/** Listens on a free port and answers its base URL. */
const listen = async (server) => {
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${server.address().port}`
}

describe('verdict', () => {
  it('is healthy with no errors, small lag, reserved WAL and a recent checkpoint', () => {
    expect(verdict(diagnostics(), NOW)).toEqual({
      errorCount: 0,
      lagBytes: 96,
      lastCheckpoint: new Date(NOW - 5000).toISOString(),
      reasons: [],
      safeWalSize: 4_298_026_312,
      status: 'healthy',
      walStatus: 'reserved',
    })
  })

  it('never carries a URI or a table name', () => {
    const body = JSON.stringify(verdict(diagnostics({ tableErrors: [error] }), NOW))
    expect(body).not.toContain('postgres')
    expect(body).not.toContain('routes')
  })

  it.each([
    ['a source connection error', { sourceErrors: [error] }, 'errors'],
    ['a sync rules error', { ruleErrors: [error] }, 'errors'],
    ['a table error', { tableErrors: [error] }, 'errors'],
    ['an error with no level', { ruleErrors: [{ message: 'boom' }] }, 'errors'],
    ['lag past the threshold', { connection: { replication_lag_bytes: MAX_LAG_BYTES + 1 } }, 'lag'],
    ['unreserved WAL', { connection: { wal_status: 'unreserved' } }, 'wal'],
    ['lost WAL', { connection: { wal_status: 'lost' } }, 'wal'],
    ['WAL headroom under the floor', { connection: { safe_wal_size: MIN_SAFE_WAL_BYTES - 1 } }, 'walHeadroom'],
    ['no WAL headroom under a capped slot', { connection: { safe_wal_size: null } }, 'walHeadroom'],
    [
      'a stale checkpoint',
      { connection: { last_checkpoint_ts: new Date(NOW - MAX_CHECKPOINT_AGE_MS - 1).toISOString() } },
      'checkpoint',
    ],
    ['an unparseable checkpoint', { connection: { last_checkpoint_ts: 'yesterday-ish' } }, 'checkpoint'],
    ['a missing checkpoint', { connection: { last_checkpoint_ts: undefined } }, 'checkpoint'],
  ])('is unhealthy on %s', (_, overrides, reason) => {
    const result = verdict(diagnostics(overrides), NOW)
    expect(result.status).toBe('unhealthy')
    expect(result.reasons).toEqual([reason])
  })

  it.each([
    ['warnings only', { ruleErrors: [warning], sourceErrors: [warning], tableErrors: [warning] }],
    ['extended WAL', { connection: { wal_status: 'extended' } }],
    [
      'no WAL headroom with max_slot_wal_keep_size unset',
      { connection: { max_slot_wal_keep_size: -1, safe_wal_size: null } },
    ],
  ])('stays healthy with %s', (_, overrides) => {
    expect(verdict(diagnostics(overrides), NOW).reasons).toEqual([])
  })

  it('is unhealthy while a sync config that failed to deploy waits beside the serving one', () => {
    const failed = diagnostics()
    failed.data.deploying_sync_rules = { connections: [{ tables: [{ errors: [error] }] }], errors: [error] }

    expect(verdict(failed, NOW)).toMatchObject({ errorCount: 2, reasons: ['errors'], status: 'unhealthy' })
  })

  it('is unhealthy with no active sync rules', () => {
    expect(verdict({ data: { connections: [] } }, NOW).reasons).toEqual(['checkpoint', 'lag', 'wal'])
  })
})

describe('diagnose', () => {
  it('answers unreachable when nothing listens', async () => {
    expect(await diagnose('http://127.0.0.1:1', 'token')).toEqual({ reasons: ['unreachable'], status: 'unreachable' })
  })

  it.each([401, 403])('answers unauthorized, not unreachable, on a %i', async (status) => {
    const server = createServer((_, response) => response.writeHead(status).end('{"error":"unauthorized"}'))
    try {
      expect(await diagnose(await listen(server), 'wrong')).toEqual({
        reasons: ['unauthorized'],
        status: 'unreachable',
      })
    } finally {
      server.close()
    }
  })
})

describe('healthServer', () => {
  /** A diagnostics upstream that counts its calls, and the sidecar in front of it on a clock the test moves. */
  const setup = async () => {
    const upstream = { calls: 0 }
    const service = createServer((_, response) => {
      upstream.calls++
      setTimeout(() => response.writeHead(200).end(JSON.stringify(diagnostics())), 20)
    })
    const clock = { now: NOW }
    const sidecar = healthServer(await listen(service), 'token', () => clock.now)
    const base = await listen(sidecar)
    const close = () => {
      sidecar.close()
      service.close()
    }
    return { base, clock, close, upstream }
  }

  it('shares one diagnostics call between concurrent requests and serves it for the cache window', async () => {
    const { base, clock, close, upstream } = await setup()
    try {
      const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(`${base}/health/sync`)))
      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200])
      expect(upstream.calls).toBe(1)

      clock.now += CACHE_MS - 1
      expect((await fetch(`${base}/health/sync`)).status).toBe(200)
      expect(upstream.calls).toBe(1)

      clock.now += 1
      await fetch(`${base}/health/sync`)
      expect(upstream.calls).toBe(2)
    } finally {
      close()
    }
  })

  it('answers HEAD as GET, which some uptime monitors probe with, and nothing else', async () => {
    const { base, close } = await setup()
    try {
      expect((await fetch(`${base}/health/sync`, { method: 'HEAD' })).status).toBe(200)
      expect((await fetch(`${base}/health/sync`, { method: 'POST' })).status).toBe(404)
    } finally {
      close()
    }
  })

  it('answers 404 to a path new URL() cannot parse and stays up', async () => {
    const { base, close } = await setup()
    try {
      const raw = await new Promise((done, fail) => {
        const socket = connect(Number(new URL(base).port), '127.0.0.1')
        let received = ''
        socket.on('data', (chunk) => (received += chunk))
        socket.on('end', () => done(received))
        socket.on('error', fail)
        socket.end('GET //[/../health/sync HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
      })
      expect(raw).toMatch(/^HTTP\/1\.1 404 /)
      expect((await fetch(`${base}/health/sync`)).status).toBe(200)
    } finally {
      close()
    }
  })
})
