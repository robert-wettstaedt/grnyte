/** `appEndpoint`, called with built requests and the locals the hook would set. */
import { formError } from '$lib/forms/schemas'
import { error, invalid, type RequestEvent } from '@sveltejs/kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted((): Record<string, string | undefined> => ({}))
vi.mock('$env/dynamic/private', () => ({ env }))

const { appEndpoint } = await import('./endpoint.server')

const signedIn = { backendUnavailable: false, claims: { sub: 'user-1' }, user: { id: 1 } }
const URL_ = 'https://grnyte.example/api/app/v1/thing'

function call(
  handle: ReturnType<typeof appEndpoint>,
  { body = {} as unknown, headers = {} as Record<string, string>, locals = signedIn as object, method = 'POST' } = {},
) {
  const request = new Request(URL_, {
    body: method === 'GET' ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
    method,
  })
  return handle({ locals, request, url: new URL(URL_) } as unknown as RequestEvent)
}

const ran = vi.fn(async (_input: { email: string }) => ({ ok: true as const }))
const endpoint = (options: Partial<Parameters<typeof appEndpoint<'email/change'>>[1]> = {}) =>
  appEndpoint('email/change', { auth: 'bearer', handler: ran, ...options })

afterEach(() => {
  ran.mockClear()
  delete env.APP_MIN_VERSION
})

describe('appEndpoint', () => {
  it('runs the handler for a JSON POST and answers no-store JSON', async () => {
    const response = await call(endpoint(), { body: { email: 'a' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses a text/plain POST with 415 before the handler, whatever cookie it carries', async () => {
    const response = await call(endpoint(), {
      body: { email: 'a' },
      headers: { 'content-type': 'text/plain', cookie: 'sb-x-auth-token=web' },
    })
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ error: { code: 'unsupported_media_type' } })
    expect(ran).not.toHaveBeenCalled()
  })

  it('answers an outage 503, never 401', async () => {
    const response = await call(endpoint(), { body: { email: 'a' }, locals: { backendUnavailable: true } })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: { code: 'auth_serviceUnavailable' } })
  })

  it('answers no Bearer 401, and a profile-less caller profile_required unless the profile is optional', async () => {
    expect((await call(endpoint(), { body: { email: 'a' }, locals: { backendUnavailable: false } })).status).toBe(401)
    const profileless = { ...signedIn, user: undefined }
    const required = await call(endpoint(), { body: { email: 'a' }, locals: profileless })
    expect(required.status).toBe(403)
    expect(await required.json()).toEqual({ error: { code: 'profile_required' } })
    expect((await call(endpoint({ profile: 'optional' }), { body: { email: 'a' }, locals: profileless })).status).toBe(
      200,
    )
  })

  it('answers a malformed body invalid_request with the field', async () => {
    const response = await call(endpoint(), { body: { email: 1 } })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'invalid_request', field: 'email' } })
  })

  it('answers a thrown invalid() and error(400) as { error: { code, field } }, params decoded', async () => {
    const refusing = (throwIt: () => never) => endpoint({ handler: async () => throwIt() })
    const fromInvalid = await call(
      refusing(() => invalid(formError('auth_passwordBreached'))),
      { body: { email: 'a' } },
    )
    expect(fromInvalid.status).toBe(400)
    expect(await fromInvalid.json()).toEqual({ error: { code: 'auth_passwordBreached' } })

    const fromError = await call(
      refusing(() =>
        error(400, { field: 'code', message: formError('settings_deleteAccountBlocked', { regions: 'A' }) }),
      ),
      { body: { email: 'a' } },
    )
    expect(fromError.status).toBe(400)
    expect(await fromError.json()).toEqual({
      error: { code: 'settings_deleteAccountBlocked', field: 'code', params: { regions: 'A' } },
    })
    expect(fromError.headers.get('cache-control')).toBe('no-store')
  })

  it('answers a bare error(400) and error(401) with the defined v1 code for the status', async () => {
    const bare = async (status: 400 | 401) =>
      (await call(endpoint({ handler: async () => error(status) }), { body: { email: 'a' } })).json()
    expect(await bare(400)).toEqual({ error: { code: 'invalid_request' } })
    expect(await bare(401)).toEqual({ error: { code: 'auth_sessionEnded' } })
  })

  it('refuses what the web twins refuse: a reauth target outside its bounds, an over-long code, a junk address', async () => {
    const subject = { action: 'region.delete', target: '1' }
    const cases = [
      ['reauth/request', { ...subject, target: '' }, 'target'],
      ['reauth/request', { ...subject, target: 'x'.repeat(81) }, 'target'],
      ['reauth/confirm', { ...subject, code: '1'.repeat(13) }, 'code'],
      ['signup', { email: 'junk', password: 'p', proofOfWork: 'w' }, 'email'],
      ['signup', { email: ' x@y.z', password: 'p', proofOfWork: 'w' }, 'email'],
      ['password/forgot', { email: 'junk', proofOfWork: 'w' }, 'email'],
      ['password/forgot', { email: ' x@y.z', proofOfWork: 'w' }, 'email'],
    ] as const
    for (const [key, body, field] of cases) {
      const response = await call(appEndpoint(key, { auth: 'none', handler: ran as never }), { body })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: { code: 'invalid_request', field } })
    }
    expect(ran).not.toHaveBeenCalled()
  })

  it('compares X-App-Version numerically against APP_MIN_VERSION, before anything else', async () => {
    env.APP_MIN_VERSION = '1.2.0'
    const at = async (headers: Record<string, string>) =>
      (await call(endpoint(), { body: { email: 'a' }, headers, locals: { backendUnavailable: true } })).status
    const versions: Record<string, string>[] = [{ 'x-app-version': '1.1.9' }, {}, { 'x-app-version': 'v1.3' }]
    for (const version of versions) {
      const response = await call(endpoint(), { body: { email: 'a' }, headers: version })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: { code: 'app_update_required', minVersion: '1.2.0' } })
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    expect(await at({ 'x-app-version': '1.10.0' })).toBe(503)
  })

  it('refuses nothing for its version while APP_MIN_VERSION is unset', async () => {
    expect((await call(endpoint(), { body: { email: 'a' } })).status).toBe(200)
  })

  it('reads a GET from the query', async () => {
    await endpoint()({
      locals: signedIn,
      request: new Request(`${URL_}?email=q`),
      url: new URL(`${URL_}?email=q`),
    } as unknown as RequestEvent)
    expect(ran).toHaveBeenCalledWith({ email: 'q' })
  })
})
