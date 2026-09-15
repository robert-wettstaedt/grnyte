// @vitest-environment node
/**
 * The send path, against a real HTTP push service.
 *
 * `web-push` is the one piece nobody can eyeball: it encrypts the payload, signs a VAPID header
 * and POSTs it, and every mistake in there looks identical from the app's side (a push that never
 * arrives). So this stands a throwaway HTTP server up in place of FCM, subscribes to it with a
 * real P-256 keypair, and asserts what goes over the wire, plus the two lifecycle rules
 * that decide whether a subscription survives its own failures.
 *
 * Over HTTPS with a throwaway self-signed certificate, because `web-push` refuses to speak plain
 * HTTP, which is correct of it, and which is why the fake service cannot merely be an `http` server.
 *
 * The browser leg (FCM delivering to the device, the worker rendering it) is not reachable from a
 * test. What guards it is `isPushPayload` in the worker, which is a one-sided check: the sender
 * builds the payload from typed values and validates nothing, so the shape is agreed by the
 * `PushPayload` type and enforced only on arrival. `push.test.ts` covers that guard.
 *
 * Needs a VAPID pair and a database, and skips itself without either:
 *   PUBLIC_TOPO_EMAIL=dev@grnyte.rocks PUBLIC_VAPID_KEY=... PRIVATE_VAPID_KEY=... npx vitest run push.server
 */
import { db } from '$lib/db/db.server'
import { pushSubscriptions } from '$lib/db/schema'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { eq } from 'drizzle-orm'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import webpush from 'web-push'
import { isPushConfigured, sendPush, sendPushToUser, subscriptionsFor } from './push.server'

/** Both halves have to be present for `webpush` to sign anything at all. */
const configured = (process.env.PUBLIC_VAPID_KEY ?? '').length > 0 && (process.env.PRIVATE_VAPID_KEY ?? '').length > 0
const runnable = configured && reachable

interface Delivery {
  body: Buffer
  headers: Record<string, string | string[] | undefined>
  path: string
}

let server: Server
let origin = ''
let user = {} as SeedUser
/** What the fake push service answers next, so a test can drive the lifecycle branches. */
let status = 201
const deliveries: Delivery[] = []

beforeAll(async () => {
  if (!runnable) return

  // A push service is an HTTPS endpoint by definition, so the stand-in has to be one too. The
  // certificate is thrown away with the test, and only this process is told to accept it.
  const dir = mkdtempSync(join(tmpdir(), 'grnyte-push-'))
  const keyPath = join(dir, 'key.pem')
  const certPath = join(dir, 'cert.pem')
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ])
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  server = createServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, (request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      deliveries.push({ body: Buffer.concat(chunks), headers: request.headers, path: request.url ?? '' })
      response.statusCode = status
      response.end()
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`

  user = await createThrowawayUser('push')
})

afterAll(async () => {
  if (runnable) {
    await sql`delete from public.push_subscriptions where user_fk = ${user.userId}`
    await dropThrowawayUser(user)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  await sql.end()
})

describe.skipIf(!runnable)('sendPush', () => {
  /** Browser-shaped subscription keys: a P-256 public point and a 16-byte auth secret. */
  const clientKeys = () => {
    const { publicKey } = webpush.generateVAPIDKeys()
    return { auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'), p256dh: publicKey }
  }

  const insert = async (endpointPath: string) => {
    const keys = clientKeys()
    const [row] = await db
      .insert(pushSubscriptions)
      .values({
        auth: keys.auth,
        authUserFk: user.authId,
        endpoint: `${origin}${endpointPath}`,
        p256dh: keys.p256dh,
        userFk: user.userId,
      })
      .returning()
    return row
  }

  it('is configured once a VAPID pair is present', () => {
    expect(isPushConfigured()).toBe(true)
  })

  it('encrypts the payload and signs it, rather than posting it in the clear', async () => {
    deliveries.length = 0
    status = 201
    const subscription = await insert('/send')

    expect(await sendPush(subscription, { badge: 2, tag: 'digest', title: 'Anna added the route Kante direkt' })).toBe(
      true,
    )

    expect(deliveries).toHaveLength(1)
    const [delivery] = deliveries
    // aes128gcm is what every current push service speaks, and what the worker decrypts.
    expect(delivery.headers['content-encoding']).toBe('aes128gcm')
    // The VAPID JWT is what identifies this application server to the push service.
    expect(String(delivery.headers.authorization)).toMatch(/^vapid /i)
    expect(String(delivery.headers.authorization)).toContain('k=')
    expect(delivery.headers.ttl).toBeDefined()
    // The whole point: the title must not be readable on the wire.
    expect(delivery.body.toString('utf8')).not.toContain('Kante direkt')
    expect(delivery.body.length).toBeGreaterThan(0)

    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
  })

  /** A dead subscription must be retired, or every future run retries a corpse. */
  it.each([404, 410, 403])('deletes the subscription on %i', async (code) => {
    status = code
    const subscription = await insert(`/gone-${code}`)

    expect(await sendPush(subscription, { tag: 'digest', title: 'x' })).toBe(false)

    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
    expect(rows).toHaveLength(0)
  })

  /** A transient failure is not a dead device: the row survives and the next digest restates it. */
  it('keeps the subscription on a transient failure', async () => {
    status = 500
    const subscription = await insert('/flaky')

    expect(await sendPush(subscription, { tag: 'digest', title: 'x' })).toBe(false)

    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
    expect(rows).toHaveLength(1)

    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
  })
})

describe.skipIf(!runnable)('sendPushToUser', () => {
  it('delivers to every device, and reports success if any took it', async () => {
    deliveries.length = 0
    status = 201

    const keys = () => ({
      auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
      p256dh: webpush.generateVAPIDKeys().publicKey,
    })

    for (const path of ['/phone', '/laptop']) {
      await db
        .insert(pushSubscriptions)
        .values({ ...keys(), authUserFk: user.authId, endpoint: `${origin}${path}`, userFk: user.userId })
    }

    const subscriptions = await subscriptionsFor([user.userId])
    expect(subscriptions).toHaveLength(2)

    expect(await sendPushToUser(subscriptions, user.userId, { tag: 'digest', title: 'x' })).toBe(true)
    expect(deliveries.map((delivery) => delivery.path).sort()).toEqual(['/laptop', '/phone'])

    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userFk, user.userId))
  })

  it('reports failure when nobody took it', async () => {
    status = 500
    await db.insert(pushSubscriptions).values({
      auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
      authUserFk: user.authId,
      endpoint: `${origin}/dead`,
      p256dh: webpush.generateVAPIDKeys().publicKey,
      userFk: user.userId,
    })

    const subscriptions = await subscriptionsFor([user.userId])
    expect(await sendPushToUser(subscriptions, user.userId, { tag: 'digest', title: 'x' })).toBe(false)

    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userFk, user.userId))
  })
})
