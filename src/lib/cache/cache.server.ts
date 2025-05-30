import { DATABASE_URL } from '$env/static/private'
import { config } from '$lib/config'
import { keyv } from '$lib/db/db.server'
import { digestMessage } from '$lib/helper'
import { cacheLogger } from '$lib/logging'
import KeyvPostgres from '@keyv/postgres'
import Keyv from 'keyv'

export const caches = {
  layoutBlocks: new Keyv({
    store: new KeyvPostgres({ uri: DATABASE_URL, pool: false }),
    ttl: config.cache.ttl,
    namespace: config.cache.keys.layoutBlocks,
  }),
  activityFeed: new Keyv({
    store: new KeyvPostgres({ uri: DATABASE_URL, pool: false }),
    ttl: config.cache.ttl,
    namespace: config.cache.keys.activityFeed,
  }),
  global: keyv,
}

export const getCacheKey = (userRegions: App.Locals['userRegions']) =>
  userRegions
    .map((region) => region.regionFk)
    .toSorted((a, b) => a - b)
    .join('-')

export const getCacheHashKey = (userRegions: App.Locals['userRegions']) => `${getCacheKey(userRegions)}_hash`

export const invalidateCache = async (cache: Keyv) => {
  cacheLogger.info('Cache invalidation started', { namespace: cache.opts?.namespace })
  try {
    await cache.clear()
    cacheLogger.info('Cache invalidation completed', { namespace: cache.opts?.namespace })
  } catch (error) {
    cacheLogger.error('Cache invalidation failed', { namespace: cache.opts?.namespace, error })
    throw error
  }
}

export const getFromCache = async <T>(cache: Keyv, userRegions: App.Locals['userRegions']): Promise<T | undefined> => {
  const cacheKey = getCacheKey(userRegions)

  try {
    const rawValue = await cache.get<string>(cacheKey)

    if (rawValue == null) {
      cacheLogger.debug('Cache miss', {
        namespace: cache.opts?.namespace,
        cacheKey,
        regionCount: userRegions.length,
      })
      return undefined
    }

    const result = JSON.parse(rawValue)
    cacheLogger.debug('Cache hit', {
      namespace: cache.opts?.namespace,
      cacheKey,
      regionCount: userRegions.length,
      dataSize: rawValue.length,
    })
    return result
  } catch (error) {
    cacheLogger.warn('Cache get failed', {
      namespace: cache.opts?.namespace,
      cacheKey,
      error,
    })
    return undefined
  }
}

export const getCacheHash = async (
  cache: Keyv,
  userRegions: App.Locals['userRegions'],
): Promise<string | undefined> => {
  const cacheKey = getCacheHashKey(userRegions)

  try {
    const hash = await cache.get<string>(cacheKey)
    cacheLogger.debug('Cache hash lookup', {
      namespace: cache.opts?.namespace,
      cacheKey,
      found: !!hash,
    })
    return hash
  } catch (error) {
    cacheLogger.error('Cache hash lookup failed', {
      namespace: cache.opts?.namespace,
      cacheKey,
      error,
    })
    return undefined
  }
}

export const setInCache = async <T>(
  cache: Keyv,
  userRegions: App.Locals['userRegions'],
  data: T,
  ttl?: number | null,
): Promise<void> => {
  if (data == null || (typeof data === 'string' && data.length === 0) || (Array.isArray(data) && data.length === 0)) {
    cacheLogger.debug('Cache set skipped - empty data', {
      namespace: cache.opts?.namespace,
      dataType: typeof data,
      isArray: Array.isArray(data),
    })
    return
  }

  const cacheTtl = ttl === null ? undefined : (ttl ?? config.cache.ttl)
  const cacheKey = getCacheKey(userRegions)
  const string = JSON.stringify(data)

  try {
    await cache.set(cacheKey, string, cacheTtl)

    const cacheHashKey = getCacheHashKey(userRegions)
    const hash = await digestMessage(string)
    await cache.set(cacheHashKey, hash, cacheTtl)

    cacheLogger.debug('Cache set completed', {
      namespace: cache.opts?.namespace,
      cacheKey,
      dataSize: string.length,
      ttl: cacheTtl,
      regionCount: userRegions.length,
    })
  } catch (error) {
    cacheLogger.error('Cache set failed', {
      namespace: cache.opts?.namespace,
      cacheKey,
      error,
    })
    throw error
  }
}

export const getFromCacheWithDefault = async <T>(
  cache: Keyv,
  userRegions: App.Locals['userRegions'],
  getDefaultValue: () => Promise<T>,
  predicate?: () => Promise<boolean>,
  ttl?: number | null,
): Promise<T> => {
  const useCache = predicate ? await predicate() : true
  const cacheKey = getCacheKey(userRegions)

  cacheLogger.debug('Cache with default started', {
    namespace: cache.opts?.namespace,
    cacheKey,
    useCache,
    regionCount: userRegions.length,
  })

  if (useCache) {
    const cached = await getFromCache<T>(cache, userRegions)
    if (cached != null) {
      cacheLogger.debug('Cache with default - using cached value', {
        namespace: cache.opts?.namespace,
        cacheKey,
      })
      return cached
    }
  }

  cacheLogger.debug('Cache with default - generating new value', {
    namespace: cache.opts?.namespace,
    cacheKey,
  })

  const start = Date.now()
  const defaultValue = await getDefaultValue()
  const duration = Date.now() - start

  cacheLogger.debug('Cache with default - value generated', {
    namespace: cache.opts?.namespace,
    cacheKey,
    generationTime: duration,
  })

  if (useCache) {
    await setInCache(cache, userRegions, defaultValue, ttl)
  }

  return defaultValue
}
