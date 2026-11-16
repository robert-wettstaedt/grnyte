import { env } from '$env/dynamic/private'
import type * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { kitRefusal } from '$lib/zero/serverMutator.server'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { json, type RequestHandler } from '@sveltejs/kit'
import { APP_ERROR_CODES, appError, NO_STORE, V1, type AppError } from './v1'

/** Set on every handler `appEndpoint` builds; the ratchet in `src/routes/api/app/gates.test.ts` reads it. */
export const APP_ENDPOINT = Symbol.for('grnyte.appEndpoint')

type Auth = 'bearer' | 'none'
type Key = keyof typeof V1

interface Options<K extends Key> {
  /** `none` still reads a Bearer when one is sent, for optional callers. */
  auth: Auth
  handler: (input: z.output<(typeof V1)[K]['request']>) => Promise<z.input<(typeof V1)[K]['response']>>
  profile?: Profile
}

type Profile = 'optional' | 'required'

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/

/** Every `/api/app/v1/` handler: JSON only, versioned, Bearer from the hook, one error shape. Keyed by its `V1` entry, which types the request and the answer. */
export function appEndpoint<K extends Key>(key: K, { auth, handler, profile }: Options<K>): RequestHandler {
  const schema: StandardSchemaV1 = V1[key].request
  const handle: RequestHandler = async ({ locals, request, url }) => {
    const refused = transportRefusal(request, locals)
    if (refused != null) return refused
    const parsed = await schema['~standard'].validate(await readInput(request, url))
    if (parsed.issues != null) return appError(400, { code: APP_ERROR_CODES.invalidRequest, ...fieldOf(parsed.issues) })
    const denied = callerRefusal(locals, auth, profile ?? 'required')
    if (denied != null) return denied

    try {
      return json(await handler(parsed.value as never), { headers: NO_STORE })
    } catch (thrown) {
      const refusal = kitRefusal(thrown)
      if (refusal == null) throw thrown
      const status = refusal.status ?? 400
      return appError(status, refusalError(status, refusal.message, refusal.field))
    }
  }
  return Object.assign(handle, { [APP_ENDPOINT]: true })
}

/** A web leaf rule (password, username, address) applied as a value, refused on its field: the v1 shape stays a plain string. */
export async function checkValue<T>(schema: StandardSchemaV1<unknown, T>, value: unknown, field: string): Promise<T> {
  const checked = await schema['~standard'].validate(value)
  if (checked.issues != null) refuseCommand(checked.issues[0].message, field)
  return (checked as StandardSchemaV1.SuccessResult<T>).value
}

/** Numerically, part by part; a missing or unparseable version is below any minimum. */
function belowMinimum(sent: null | string, minimum: string): boolean {
  const have = VERSION.exec(sent ?? '')
  const need = VERSION.exec(minimum)
  if (need == null) return false
  if (have == null) return true
  for (const part of [1, 2, 3]) {
    if (Number(have[part]) !== Number(need[part])) return Number(have[part]) < Number(need[part])
  }
  return false
}

function callerRefusal(locals: App.Locals, auth: Auth, profile: Profile): null | Response {
  if (auth !== 'bearer') return null
  if (locals.claims == null) return appError(401, { code: APP_ERROR_CODES.sessionEnded })
  if (profile === 'required' && locals.user == null) return appError(403, { code: APP_ERROR_CODES.profileRequired })
  return null
}

function fieldOf(issues: readonly StandardSchemaV1.Issue[]): { field?: string } {
  const key = issues[0]?.path?.[0]
  return key == null ? {} : { field: String(typeof key === 'object' ? key.key : key) }
}

async function readInput(request: Request, url: URL): Promise<unknown> {
  if (request.method === 'GET') return Object.fromEntries(url.searchParams)
  return request.json().catch(() => undefined)
}

const DEFINED_CODES = new Set<string>(Object.values(APP_ERROR_CODES))
/** Any other text (Kit's bare `error(400)` is `Error: 400`) answers the defined code for its status. */
const STATUS_CODES: Record<number, string> = {
  401: APP_ERROR_CODES.sessionEnded,
  404: APP_ERROR_CODES.notFound,
  503: APP_ERROR_CODES.serviceUnavailable,
}

/** A body's refusal as the one app error shape: a `formError` marker decodes into `code` and `params`. */
function refusalError(status: number, message: string, field?: string): AppError['error'] {
  let decoded: undefined | { message?: unknown; params?: Record<string, unknown> }
  try {
    decoded = JSON.parse(message) as typeof decoded
  } catch {
    // Not a marker.
  }
  const code =
    typeof decoded?.message === 'string'
      ? decoded.message
      : DEFINED_CODES.has(message)
        ? message
        : (STATUS_CODES[status] ?? APP_ERROR_CODES.invalidRequest)
  return { code, ...(decoded?.params == null ? {} : { params: decoded.params }), ...(field == null ? {} : { field }) }
}

/** Content type, app version and backend outage, before the body is read. */
function transportRefusal(request: Request, locals: App.Locals): null | Response {
  if (request.method !== 'GET' && !/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) {
    return appError(415, { code: APP_ERROR_CODES.unsupportedMediaType })
  }
  const minimum = env.APP_MIN_VERSION
  if (minimum && belowMinimum(request.headers.get('x-app-version'), minimum)) {
    return appError(400, { code: 'app_update_required', minVersion: minimum })
  }
  if (locals.backendUnavailable) return appError(503, { code: APP_ERROR_CODES.serviceUnavailable })
  return null
}
