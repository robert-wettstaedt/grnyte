export const invalidateCache = (cacheName: string) => {
  return caches.delete(cacheName)
}

export const getFromCache = async <T>(id: string | number): Promise<T | undefined> => {
  const cache = await caches.open(String(id))
  const response = await cache.match(String(id))

  if (response == null) {
    return undefined
  }

  try {
    const clone = response.clone()
    return JSON.parse(await clone.json())
  } catch (error) {
    return (await response.text()) as T
  }
}

export const setInCache = async <T>(id: string | number, data: T): Promise<void> => {
  if (data == null || (typeof data === 'string' && data.length === 0) || (Array.isArray(data) && data.length === 0)) {
    return
  }

  const string = typeof data === 'string' ? data : JSON.stringify(data)
  const cache = await caches.open(String(id))
  await cache.put(String(id), new Response(string))
}

export const calculateCacheSize = async (): Promise<number> => {
  let size = 0

  const keys = await caches.keys()
  await Promise.all(
    keys.map(async (key) => {
      const cache = await caches.open(key)
      const requests = await cache.keys()
      await Promise.all(
        requests.map(async (request) => {
          const response = await cache.match(request)
          const url = response?.url == null || response.url === '' ? null : new URL(response.url)
          if (response && url != null && url.pathname !== '/') {
            const clone = response.clone()
            const blob = await clone.blob()
            size += blob.size
          }
        }),
      )
    }),
  )

  return size
}

export const clearCache = async (): Promise<void> => {
  const keys = await caches.keys()
  await Promise.all(
    keys.map(async (key) => {
      const cache = await caches.open(key)
      const requests = await cache.keys()
      await Promise.all(
        requests.map(async (request) => {
          const response = await cache.match(request)
          const url = response?.url == null || response.url === '' ? null : new URL(response.url)

          if (response && url != null && url.pathname !== '/') {
            await cache.delete(request)
          }
        }),
      )
    }),
  )
}
