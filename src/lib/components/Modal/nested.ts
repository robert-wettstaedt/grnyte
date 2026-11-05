import { tick } from 'svelte'

/** Close one dialog, then open the next: a nested Modal must not unmount the one it opened from in the
 *  same flush, or zag leaves the app `aria-hidden` (AGENTS.md). */
export async function openAfter(close: () => void, open: () => void) {
  close()
  await tick()
  open()
}
