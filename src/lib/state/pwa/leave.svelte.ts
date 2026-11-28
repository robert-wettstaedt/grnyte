import { tellOtherTabsSignedOut, wipeAndLeave } from './wipe'

/** The open sign-out question, which the root layout's dialog shows. */
let asking = $state<{ answer: (go: boolean) => void; count: number }>()

/** Kept after the answer, so the dialog's closing animation still reads the count it asked about. */
let asked = $state(0)

/** Reactive. Whether a sign-out waits on the person, and how many writes it would drop. */
export const question = () => asking

/** Reactive. The count the last question asked about. */
export const askedCount = () => asked

/** Whether a sign-out may go ahead: only after asking, when writes queued on this device would be lost with it. */
export async function mayDiscard(): Promise<boolean> {
  // Lazy: the landing pages sign out too, and must not load a sync engine for it.
  const { refreshQueued } = await import('$lib/state/engine')
  const count = await refreshQueued()
  if (count === 0) return true
  asked = count
  return new Promise((resolve) => {
    asking = {
      answer: (go) => {
        asking = undefined
        resolve(go)
      },
      count,
    }
  })
}

/** The `signOut` form's `enhance` callback: once the sign-out took, tells the other tabs and wipes this device. */
export const leaveAfterSignOut =
  (to?: string) =>
  async ({ submit }: { submit: () => Promise<boolean> }): Promise<void> => {
    if (!(await mayDiscard())) return
    // Only once the sign-out took: a failed one leaves a signed-in user who still needs their replica.
    if (await submit()) {
      tellOtherTabsSignedOut()
      await wipeAndLeave(to)
    }
  }
