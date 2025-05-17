import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { config } from '$lib/config'
import { keyv } from '$lib/db/db.server'
import { digestMessage } from '$lib/helper'

export const getCacheKey = (id: string | number) => `${PUBLIC_APPLICATION_NAME}_${id}`
export const getCacheHashKey = (id: string | number) => `${getCacheKey(id)}_hash`

export const invalidateCache = async (id: string | number) => {
  const cacheKey = getCacheKey(id)
  await keyv.delete(cacheKey)

  const cacheHashKey = getCacheHashKey(id)
  await keyv.delete(cacheHashKey)
}

export const getFromCache = async <T>(id: string | number): Promise<T | undefined> => {
  const cacheKey = getCacheKey(id)
  const rawValue = await keyv.get<string>(cacheKey)

  if (rawValue == null) {
    return undefined
  }

  try {
    return JSON.parse(rawValue)
  } catch (error) {
    return rawValue as T
  }
}

export const getCacheHash = async (id: string | number): Promise<string | undefined> => {
  const cacheKey = getCacheHashKey(id)
  return keyv.get<string>(cacheKey)
}

export const setInCache = async <T>(id: string | number, data: T, ttl?: number | null): Promise<void> => {
  if (data == null || (typeof data === 'string' && data.length === 0) || (Array.isArray(data) && data.length === 0)) {
    return
  }

  const cacheTtl = ttl === null ? undefined : (ttl ?? config.cache.ttl)

  const cacheKey = getCacheKey(id)
  const string = JSON.stringify(data)
  await keyv.set(cacheKey, string, cacheTtl)

  const cacheHashKey = getCacheHashKey(id)
  const hash = await digestMessage(string)
  await keyv.set(cacheHashKey, hash, cacheTtl)
}

export const getFromCacheWithDefault = async <T>(
  id: string | number,
  getDefaultValue: () => Promise<T>,
  predicate?: () => Promise<boolean>,
  ttl?: number | null,
): Promise<T> => {
  const useCache = predicate ? await predicate() : true

  if (useCache) {
    const cached = await getFromCache<T>(id)
    if (cached != null) {
      return cached
    }
  }

  const defaultValue = await getDefaultValue()

  if (useCache) {
    await setInCache(id, defaultValue, ttl)
  }

  return defaultValue
}
