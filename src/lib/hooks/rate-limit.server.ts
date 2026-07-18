import { building } from '$app/environment'
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
