/** Calls an `/api/app/v1/` handler the way a native app's request reaches it, inside Kit's request store. */
import type { RequestEvent, RequestHandler } from '@sveltejs/kit'
import { with_request_store } from '@sveltejs/kit/internal/server'

interface AppCall {
  body?: unknown
  /** The jar the request carries; an empty one by default. */
  cookies?: object
  headers?: Record<string, string>
  /** What the hook would have set; anonymous by default. */
  locals?: object
  method?: 'GET' | 'POST'
}

export async function appCall(
  handler: RequestHandler,
  path: string,
  { body = {}, cookies, headers = {}, locals = {}, method = 'POST' }: AppCall = {},
): Promise<Response> {
  const url = new URL(`https://grnyte.example/api/app/v1/${path}`)
  const request = new Request(url, {
    body: method === 'GET' ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
    method,
  })
  const event = {
    cookies: cookies ?? { get: () => undefined, getAll: () => [], set: () => {} },
    getClientAddress: () => '198.51.100.7',
    locals: { backendUnavailable: false, claims: undefined, user: undefined, userRegions: [], ...locals },
    request,
    setHeaders: () => {},
    url,
  } as unknown as RequestEvent
  const state = { remote: { data: new Map() }, transport: {} }
  return with_request_store({ event, state } as never, () => handler(event as never)) as Promise<Response>
}
