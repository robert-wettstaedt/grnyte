import { randomId } from '$lib/forms/randomId'

export interface LockWaits {
  /** The account's file waits for a lock another tab holds, so it does not open. */
  file: boolean
  /** This page waits for the sync lock another page holds, so it is unconnected whatever the network does. */
  sync: boolean
}

/** What the account's file waits for, read off the browser's locks (names as PowerSync and its SQLite give them). */
export async function lockWaits(file: string): Promise<LockWaits> {
  // Absent on an insecure origin.
  const manager = navigator.locks as LockManager | undefined
  if (manager == null) return { file: false, sync: false }
  // Under a lock of its own name: the one way a page learns its client id.
  const mine = `grnyte-${randomId()}`
  return await manager.request(mine, async () => {
    const { held = [], pending = [] } = await manager.query()
    const page = held.find(({ name }) => name === mine)?.clientId
    const waiting = (name: string) =>
      pending.filter(
        (wait) => wait.name === name && held.some((lock) => lock.name === name && lock.clientId !== wait.clientId),
      )
    return {
      file: [`db-lock-${file}`, `lock##IDB(${file}):/${file}##access`].some((name) => waiting(name).length > 0),
      sync: waiting(`streaming-sync-sync-${file}`).some(({ clientId }) => clientId === page),
    }
  })
}
