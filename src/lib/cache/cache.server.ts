import { config } from '$lib/config'
import { keyv, keyvPostgres } from '$lib/db/db.server'
import { digestMessage } from '$lib/helper'
import Keyv from 'keyv'

export const caches = {
  layoutBlocks: new Keyv({ store: keyvPostgres, ttl: config.cache.ttl, namespace: config.cache.keys.layoutBlocks }),
  activityFeed: new Keyv({ store: keyvPostgres, ttl: config.cache.ttl, namespace: config.cache.keys.activityFeed }),
  global: keyv,
}

export const getCacheKey = (userRegions: App.Locals['userRegions']) =>
  userRegions
    .map((region) => region.regionFk)
    .toSorted((a, b) => a - b)
    .join('-')

export const getCacheHashKey = (userRegions: App.Locals['userRegions']) => `${getCacheKey(userRegions)}_hash`

export const invalidateCache = async (cache: Keyv) => {
  await cache.clear()
}

export const getFromCache = async <T>(cache: Keyv, userRegions: App.Locals['userRegions']): Promise<T | undefined> => {
  const cacheKey = getCacheKey(userRegions)
  const rawValue = await cache.get<string>(cacheKey)

  if (rawValue == null) {
    return undefined
  }

  try {
    return JSON.parse(rawValue)
  } catch (error) {
    return rawValue as T
  }
}

export const getCacheHash = async (
  cache: Keyv,
  userRegions: App.Locals['userRegions'],
): Promise<string | undefined> => {
  const cacheKey = getCacheHashKey(userRegions)
  return cache.get<string>(cacheKey)
}

export const setInCache = async <T>(
  cache: Keyv,
  userRegions: App.Locals['userRegions'],
  data: T,
  ttl?: number | null,
): Promise<void> => {
  if (data == null || (typeof data === 'string' && data.length === 0) || (Array.isArray(data) && data.length === 0)) {
    return
  }

  const cacheTtl = ttl === null ? undefined : (ttl ?? config.cache.ttl)

  const cacheKey = getCacheKey(userRegions)
  const string = JSON.stringify(data)
  await cache.set(cacheKey, string, cacheTtl)

  const cacheHashKey = getCacheHashKey(userRegions)
  const hash = await digestMessage(string)
  await cache.set(cacheHashKey, hash, cacheTtl)
}

export const getFromCacheWithDefault = async <T>(
  cache: Keyv,
  userRegions: App.Locals['userRegions'],
  getDefaultValue: () => Promise<T>,
  predicate?: () => Promise<boolean>,
  ttl?: number | null,
): Promise<T> => {
  const useCache = predicate ? await predicate() : true

  if (useCache) {
    const cached = await getFromCache<T>(cache, userRegions)
    if (cached != null) {
      return cached
    }
  }

  const defaultValue = await getDefaultValue()

  if (useCache) {
    await setInCache(cache, userRegions, defaultValue, ttl)
  }

  return defaultValue
}
