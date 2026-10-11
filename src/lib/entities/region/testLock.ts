import { sql } from '$lib/db/testDb'

/**
 * Holds an advisory transaction lock in a second session and reports whether `run` stalled on it.
 * Proves the code under test takes that lock, which no single-session test can see.
 */
export async function stallsOnLock(namespace: string, key: number, run: () => Promise<unknown>): Promise<boolean> {
  let release = () => {}
  let ready = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  const locked = new Promise<void>((resolve) => (ready = resolve))

  const holder = sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${namespace}), ${key})`
    ready()
    await held
  })
  await locked

  let done = false
  const running = run().then(
    () => (done = true),
    () => (done = true),
  )
  await new Promise((resolve) => setTimeout(resolve, 300))
  const stalled = !done

  release()
  await holder
  await running
  return stalled
}
