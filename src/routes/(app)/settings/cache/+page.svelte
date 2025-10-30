<script lang="ts">
  import AppBar from '$lib/components/AppBar'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  interface StorageInfo {
    name: string
    size: string
    error?: string
  }

  let databases: StorageInfo[] = $state([])
  let cacheStorages: StorageInfo[] = $state([])

  let loadingIndexedDb = $state(true)
  let loadingCache = $state(true)
  let clearing = $state(false)

  async function loadIndexedDBSizes() {
    try {
      loadingIndexedDb = true
      // Get all database names
      const dbList = await indexedDB.databases()

      if (dbList.length === 0) {
        databases = []
        return
      }

      const databaseInfos: StorageInfo[] = []

      for (const dbInfo of dbList) {
        try {
          const size = await getDatabaseSize(dbInfo.name)
          const humanReadableSize = formatBytes(size)
          databaseInfos.push({
            name: dbInfo.name || 'Unknown',
            size: humanReadableSize,
          })
        } catch (error) {
          databaseInfos.push({
            name: dbInfo.name || 'Unknown',
            size: 'Error',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      databases = databaseInfos
    } catch (error) {
      console.error('Error accessing IndexedDB:', error)
      databases = []
    } finally {
      loadingIndexedDb = false
    }
  }

  async function loadCacheSizes() {
    try {
      loadingCache = true

      if (!('caches' in window)) {
        cacheStorages = []
        return
      }

      const cacheNames = await caches.keys()

      if (cacheNames.length === 0) {
        cacheStorages = []
        return
      }

      const cacheInfos: StorageInfo[] = []

      for (const cacheName of cacheNames) {
        try {
          const cache = await caches.open(cacheName)
          const requests = await cache.keys()
          let totalSize = 0

          for (const request of requests) {
            try {
              const response = await cache.match(request)
              if (response) {
                const blob = await response.blob()
                totalSize += blob.size
              }
            } catch (error) {
              console.warn(`Error reading cache entry for ${request.url}:`, error)
            }
          }

          const humanReadableSize = formatBytes(totalSize)
          cacheInfos.push({
            name: cacheName,
            size: humanReadableSize,
          })
        } catch (error) {
          cacheInfos.push({
            name: cacheName,
            size: 'Error',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      cacheStorages = cacheInfos
    } catch (error) {
      console.error('Error accessing Cache Storage:', error)
      cacheStorages = []
    } finally {
      loadingCache = false
    }
  }

  async function getDatabaseSize(dbName: string | undefined) {
    return new Promise<number>((resolve, reject) => {
      if (dbName == null) {
        return reject()
      }

      const request = indexedDB.open(dbName)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        const db = request.result
        let totalSize = 0
        let completedStores = 0
        const objectStoreNames = Array.from(db.objectStoreNames)

        if (objectStoreNames.length === 0) {
          db.close()
          resolve(0)
          return
        }

        const transaction = db.transaction(objectStoreNames, 'readonly')

        objectStoreNames.forEach((storeName) => {
          const store = transaction.objectStore(storeName)
          const request = store.getAll()

          request.onsuccess = () => {
            // Estimate size by serializing the data
            const data = request.result
            const serialized = JSON.stringify(data)
            totalSize += new Blob([serialized]).size

            completedStores++
            if (completedStores === objectStoreNames.length) {
              db.close()
              resolve(totalSize)
            }
          }

          request.onerror = () => {
            db.close()
            reject(request.error)
          }
        })
      }
    })
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  async function clearAllStorage() {
    try {
      clearing = true

      // Clear IndexedDB databases
      const dbList = await indexedDB.databases()
      for (const dbInfo of dbList) {
        if (dbInfo.name) {
          try {
            const deleteRequest = indexedDB.deleteDatabase(dbInfo.name)
            await new Promise((resolve, reject) => {
              deleteRequest.onsuccess = () => resolve(void 0)
              deleteRequest.onerror = () => reject(deleteRequest.error)
              deleteRequest.onblocked = () => {
                console.warn(`Delete blocked for database: ${dbInfo.name}`)
                // Resolve anyway, as the database might be deleted eventually
                resolve(void 0)
              }
            })
          } catch (error) {
            console.error(`Failed to delete database ${dbInfo.name}:`, error)
          }
        }
      }

      // Clear Cache Storage
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        for (const cacheName of cacheNames) {
          try {
            await caches.delete(cacheName)
          } catch (error) {
            console.error(`Failed to delete cache ${cacheName}:`, error)
          }
        }
      }

      // Reload the data to reflect changes
      await Promise.all([loadIndexedDBSizes(), loadCacheSizes()])

      console.log('All storage cleared successfully')
    } catch (error) {
      console.error('Error clearing storage:', error)
    } finally {
      clearing = false
    }
  }

  onMount(() => {
    loadIndexedDBSizes()
    loadCacheSizes()
  })
</script>

<AppBar classes="mx-auto max-w-lg">
  {#snippet lead()}
    App cache
  {/snippet}
</AppBar>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="rest">
  <header class="space-y-1">
    <h2 class="h4">IndexedDB Databases</h2>
  </header>

  <section class="w-full space-y-5">
    {#if loadingIndexedDb}
      <div class="flex items-center justify-center p-4">
        <ProgressRing value={null} size="size-20" />
      </div>
    {:else if databases.length === 0}
      <div class="flex items-center justify-center p-4">
        <div class="text-surface-600-300 text-sm">No IndexedDB databases found</div>
      </div>
    {:else}
      <ul class="space-y-2">
        {#each databases as db, index}
          <li class={index > 0 ? 'border-surface-800 border-t' : ''}>
            <div class="p-2">
              <div class="flex items-center justify-between gap-4">
                <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                  {db.name}
                </div>

                <div class="whitespace-nowrap">
                  {db.size}
                </div>
              </div>

              {#if db.error}
                <div class="text-error-500 text-sm">Error: {db.error}</div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="rest">
  <header class="space-y-1">
    <h2 class="h4">Cache Storage</h2>
  </header>

  <section class="w-full space-y-5">
    {#if loadingCache}
      <div class="flex items-center justify-center p-4">
        <ProgressRing value={null} size="size-20" />
      </div>
    {:else if cacheStorages.length === 0}
      <div class="flex items-center justify-center p-4">
        <div class="text-surface-600-300 text-sm">No Cache Storage found</div>
      </div>
    {:else}
      <ul class="space-y-2">
        {#each cacheStorages as cache, index}
          <li class={index > 0 ? 'border-surface-800 border-t' : ''}>
            <div class="p-2">
              <div class="flex items-center justify-between gap-4">
                <div class="overflow-hidden text-ellipsis whitespace-nowrap">
                  {cache.name}
                </div>

                <div class="whitespace-nowrap">
                  {cache.size}
                </div>
              </div>

              {#if cache.error}
                <div class="text-error-500 text-sm">Error: {cache.error}</div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4">
  <header class="space-y-1">
    <h2 class="h4">Clear All Storage</h2>

    <p class="text-surface-600-300 text-sm">
      This will permanently delete all IndexedDB databases and cache storage. This action cannot be undone.
    </p>
  </header>

  <section class="w-full space-y-5">
    <button
      class="btn preset-filled-error-500 w-full"
      onclick={clearAllStorage}
      disabled={clearing || loadingIndexedDb || loadingCache}
    >
      {#if clearing}
        <span class="me-2">
          <ProgressRing size="size-4" value={null} />
        </span>
      {/if}

      Clear all storage
    </button>
  </section>
</div>
