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

export const setInCache = async <T>(id: string | number, data: T): Promise<void> => {
  if (data == null || (typeof data === 'string' && data.length === 0) || (Array.isArray(data) && data.length === 0)) {
    return
  }

  const cacheKey = getCacheKey(id)
  const string = JSON.stringify(data)
  await keyv.set(cacheKey, string, config.cache.ttl)

  const cacheHashKey = getCacheHashKey(id)
  const hash = await digestMessage(string)
  await keyv.set(cacheHashKey, hash, config.cache.ttl)
}
