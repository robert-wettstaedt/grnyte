import { browser } from '$app/environment'

/** Tailwind's `md`, and it has to stay equal to it: the shell's NavRail switches at the same
 *  point (`md:pl-20` in `(shell)/+layout.svelte`). */
export const DESKTOP_QUERY = '(min-width: 48rem)'

/** Fetch only the branch this viewport can show, so neither form factor carries the other's
 *  dependencies. Call from `<script module>`, so the chunk is in flight during hydration. */
export const preloadBranch = (loadDesktop: () => Promise<unknown>, loadMobile: () => Promise<unknown>): void => {
  if (browser) {
    void ((window.matchMedia?.(DESKTOP_QUERY).matches ?? false) ? loadDesktop() : loadMobile())
  }
}
