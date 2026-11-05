import { tick } from 'svelte'

/** Swap what a sheet shows only once the click is over: svelte-bottom-sheet closes on a document click
 *  whose target it does not contain, and a row the swap already unmounted reads as outside. */
export function afterClick(swap: () => void) {
  setTimeout(swap)
}

/** Close one dialog, then open the next: a nested Modal must not unmount the one it opened from in the
 *  same flush, or zag leaves the app `aria-hidden` (AGENTS.md). */
export async function openAfter(close: () => void, open: () => void) {
  close()
  await tick()
  open()
}
