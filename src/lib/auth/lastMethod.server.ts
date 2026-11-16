import type { Cookies } from '@sveltejs/kit'

/** How this browser last signed in, for the "Last used" badge (design decision 9). */
export type LastMethod = (typeof METHODS)[number]

const COOKIE = 'grnyte-last-method'
const METHODS = ['apple', 'email', 'google'] as const
const MAX_AGE_S = 400 * 24 * 60 * 60

/** Only the three values read back; anything else is no badge. */
export function lastMethod(cookies: Pick<Cookies, 'get'>): LastMethod | null {
  const value = cookies.get(COOKIE)
  return METHODS.find((method) => method === value) ?? null
}

/** After the session is written, never on a link, a confirmation or a failure. */
export function rememberMethod(cookies: Pick<Cookies, 'set'>, method: LastMethod): void {
  cookies.set(COOKIE, method, { httpOnly: true, maxAge: MAX_AGE_S, path: '/', sameSite: 'lax' })
}
