import type { LastMethod } from '$lib/auth'
import type { Cookies } from '@sveltejs/kit'

const COOKIE = 'grnyte-last-method'
const METHODS: readonly LastMethod[] = ['apple', 'email', 'google']
const MAX_AGE_S = 400 * 24 * 60 * 60

export function lastMethod(cookies: Pick<Cookies, 'get'>): LastMethod | null {
  const value = cookies.get(COOKIE)
  return METHODS.find((method) => method === value) ?? null
}

/** After the session is written, never on a link, a confirmation or a failure. */
export function rememberMethod(cookies: Pick<Cookies, 'set'>, method: LastMethod): void {
  cookies.set(COOKIE, method, { httpOnly: true, maxAge: MAX_AGE_S, path: '/', sameSite: 'lax' })
}
