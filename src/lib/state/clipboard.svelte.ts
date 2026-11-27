import { browser } from '$app/environment'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

/**
 * Copy-to-clipboard with a brief "copied" confirmation. Call once during
 * component init, read `.copied` for the check-mark swap, and call `.copy(text)`
 * on click. The confirmation resets itself after `resetMs`.
 */
export function createCopyButton(resetMs = 1500) {
  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => () => clearTimeout(timer))

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

/** The platform share sheet where it can share this link (mostly mobile), else a copy of the link. Call during init. */
export function createShare(text: () => string, url: () => string) {
  const clip = createCopyButton()
  const data = $derived<ShareData>({ text: text(), title: PUBLIC_APPLICATION_NAME, url: url() })
  const canShare = $derived(browser && navigator.canShare?.(data) === true)

  return {
    get canShare() {
      return canShare
    },
    get copied() {
      return clip.copied
    },
    copy: () => clip.copy(url()),
    // Rejects when the user dismisses the share sheet; nothing to recover from.
    share: () => void navigator.share(data).catch(() => {}),
  }
}
