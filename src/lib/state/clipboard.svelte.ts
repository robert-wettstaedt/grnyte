import { onDestroy } from 'svelte'

/**
 * Copy-to-clipboard with a brief "copied" confirmation. Call once during
 * component init, read `.copied` for the check-mark swap, and call `.copy(text)`
 * on click. The confirmation resets itself after `resetMs`.
 */
export function createCopyButton(resetMs = 1500) {
  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => (copied = false), resetMs)
    } catch {
      // Clipboard unavailable (insecure context) or permission denied, nothing to recover from.
    }
  }

  return {
    get copied() {
      return copied
    },
    copy,
  }
}
