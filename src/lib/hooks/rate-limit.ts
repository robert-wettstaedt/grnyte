import { building } from '$app/environment'
import { config } from '$lib/config'
import { apiLogger } from '$lib/logging'
import type { Handle } from '@sveltejs/kit'

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
  const windowMs = config.api.rateLimit.windowMs
  const max = config.api.rateLimit.max

  // Clean up expired entries
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  }

  // Initialize or get existing rate limit data
  if (!store[ip]) {
    store[ip] = {
      count: 0,
      resetTime: now + windowMs,
    }
  }

  // Reset if window has expired
  if (store[ip].resetTime < now) {
    store[ip] = {
      count: 0,
      resetTime: now + windowMs,
    }
  }

  // Increment request count
  store[ip].count++

  // Set rate limit headers
  const remaining = Math.max(0, max - store[ip].count)
  const reset = Math.ceil((store[ip].resetTime - now) / 1000)

  event.setHeaders({
    'X-RateLimit-Limit': max.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': reset.toString(),
  })

  // Check if rate limit exceeded
  if (store[ip].count > max) {
    apiLogger.warn('Rate limit exceeded', { ip, count: store[ip].count })
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': reset.toString(),
      },
    })
  }

  apiLogger.debug('Rate limit check passed', {
    ip,
    count: store[ip].count,
    remaining,
    reset,
  })

  return resolve(event)
}
