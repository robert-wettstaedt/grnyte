import { vi } from 'vitest'

/** Test-only: IndexedDB holding these databases (without `databases()` when undefined); returns what got deleted. */
export function stubIndexedDb(databases: string[] | undefined): string[] {
  const deleted: string[] = []
  vi.stubGlobal('indexedDB', {
    ...(databases && { databases: async () => databases.map((name) => ({ name })) }),
    deleteDatabase: (name: string) => {
      deleted.push(name)
      const request = {} as IDBOpenDBRequest
      queueMicrotask(() => request.onsuccess?.({} as Event))
      return request
    },
  })
  return deleted
}
