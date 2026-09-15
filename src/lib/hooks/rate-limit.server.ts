import { building } from '$app/environment'
import { ZERO_API_PREFIX } from '$lib/hooks/auth.server'
import type { Handle } from '@sveltejs/kit'

export const RATE_LIMIT = {
  max: 500, // requests per IP per window
  windowMs: 15 * 60 * 1000,
}

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

export const rateLimit: Handle = async ({ event, resolve }) => {
  if (building) {
    return resolve(event)
  }

  // zero-cache is a server, not a browser. Every get-queries POST, for every user, arrives from the
  // one VPS egress address, so an IP budget here is a single shared budget for the whole app's
  // query transformation. Ordinary traffic spends it without anybody misbehaving: zero-cache
  // revalidates a connection's auth and retransforms a client group's queries every 300 seconds
  // each, which puts a floor of roughly 3 requests per connection per window under it before a
  // reader has touched anything.
  //
  // And a refusal here is not a backoff. zero-cache retries only 5xx (its own fetch helper), so a
  // 429 is a hard TransformFailed that stops sync for every client behind that address at once.
  // That is the same asymmetry the get-queries handler already leans on when it answers an expired
  // token with 502 rather than 401.
  //
  // Exempt rather than unprotected: the handler verifies its own Bearer, locally, before it reads
  // the database, so an unauthenticated flood is still refused cheaply.
  //
  // ponytail: exempt rather than re-keyed on the token `sub`, which would mean either verifying the
  // JWT a second time here or trusting an unverified claim, and a claim the caller can forge is not
  // a limiter. Per-user throttling, if it is ever wanted, belongs in the handler after
  // `verifyAccessToken` has returned.
  if (event.url.pathname.startsWith(ZERO_API_PREFIX)) {
    return resolve(event)
  }

  const ip = event.getClientAddress()
  const now = Date.now()
  const { max, windowMs } = RATE_LIMIT

  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  }

  if (!store[ip]) {
    store[ip] = {
      count: 0,
      resetTime: now + windowMs,
    }
  }

  if (store[ip].resetTime < now) {
    store[ip] = {
      count: 0,
      resetTime: now + windowMs,
    }
  }

  store[ip].count++

  const remaining = Math.max(0, max - store[ip].count)
  const reset = Math.ceil((store[ip].resetTime - now) / 1000)

  event.setHeaders({
    'X-RateLimit-Limit': max.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': reset.toString(),
  })

  if (store[ip].count > max) {
    return new Response('Too Many Requests', {
      headers: {
        'Retry-After': reset.toString(),
      },
      status: 429,
    })
  }

  return resolve(event)
}
