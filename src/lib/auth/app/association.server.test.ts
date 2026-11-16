import { isHttpError } from '@sveltejs/kit'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted((): Record<string, string | undefined> => ({}))
vi.mock('$env/dynamic/private', () => ({ env }))

const apple = await import('../../../routes/.well-known/apple-app-site-association/+server')
const android = await import('../../../routes/.well-known/assetlinks.json/+server')
const { APP_LINK_PREFIXES } = await import('./constants')

type Get = (event: never) => Promise<Response> | Response

const fetchFile = async (GET: Get) => {
  try {
    return await GET({} as never)
  } catch (e) {
    if (isHttpError(e)) return e.status
    throw e
  }
}

const json = async (GET: Get) => {
  const response = await fetchFile(GET)
  expect(response).toBeInstanceOf(Response)
  const res = response as Response
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('application/json')
  return res.json()
}

beforeEach(() => {
  env.APPLE_TEAM_ID = 'TEAM123456'
  delete env.IOS_APP_ASSOCIATION_ENABLED
  delete env.ANDROID_CERT_SHA256
})

describe('the Apple association file', () => {
  it('holds applinks and webcredentials, the latter naming only the app', async () => {
    env.IOS_APP_ASSOCIATION_ENABLED = 'true'
    const body = await json(apple.GET)

    expect(Object.keys(body).sort()).toStrictEqual(['applinks', 'webcredentials'])
    expect(body.webcredentials).toStrictEqual({ apps: ['TEAM123456.rocks.grnyte'] })
    expect(body.applinks.details).toHaveLength(1)
    expect(body.applinks.details[0].appIDs).toStrictEqual(['TEAM123456.rocks.grnyte'])
  })

  it('excludes /auth and /api before claiming exactly the content paths, never the whole site', async () => {
    env.IOS_APP_ASSOCIATION_ENABLED = 'true'
    const components: { '/': string; exclude?: boolean }[] = (await json(apple.GET)).applinks.details[0].components

    expect(components.slice(0, 2)).toStrictEqual([
      { '/': '/auth/*', exclude: true },
      { '/': '/api/*', exclude: true },
    ])
    expect(components.slice(2).filter((c) => 'exclude' in c)).toStrictEqual([])
    // Literal, not read off APP_LINK_PREFIXES: no /*, no /app-return.
    expect(components.slice(2).map((c) => c['/'])).toStrictEqual([
      '/areas',
      '/areas/*',
      '/blocks',
      '/blocks/*',
      '/routes',
      '/routes/*',
      '/feed',
      '/feed/*',
      '/users',
      '/users/*',
    ])
  })

  it('answers 404 while the switch is off, though web sign-in already sets the team ID', async () => {
    expect(await fetchFile(apple.GET)).toBe(404)
  })
})

describe('the Android asset links file', () => {
  it('delegates links to rocks.grnyte for each configured fingerprint', async () => {
    env.ANDROID_CERT_SHA256 = 'AA:BB, CC:DD'

    expect(await json(android.GET)).toStrictEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'rocks.grnyte',
          sha256_cert_fingerprints: ['AA:BB', 'CC:DD'],
        },
      },
    ])
  })

  it('answers 404 without a fingerprint, whatever the Apple switch says', async () => {
    env.IOS_APP_ASSOCIATION_ENABLED = 'true'
    expect(await fetchFile(android.GET)).toBe(404)
  })
})

/** Every URL directory under `src/routes`, route groups stripped. */
function routePaths(dir = 'src/routes', path = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .flatMap((d) => {
      const next = /^\(.*\)$/.test(d.name) ? path : `${path}/${d.name}`
      return [next, ...routePaths(join(dir, d.name), next)]
    })
}

describe('the claimed content paths', () => {
  const DENYLIST = ['/settings', '/regions', '/auth', '/api', '/app-return', '/explore', '/profile', '/invite']

  it.each(APP_LINK_PREFIXES)('%s is a real route prefix', (prefix) => {
    expect(routePaths()).toContain(prefix)
  })

  it.each(APP_LINK_PREFIXES)('%s is no account, sign-in or API path', (prefix) => {
    expect(DENYLIST.filter((denied) => prefix.startsWith(denied))).toStrictEqual([])
  })
})
