<script lang="ts">
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { createCopyButton } from '$lib/state/clipboard.svelte'

  interface Props {
    /** Text shared alongside the current page URL. */
    text: string
  }

  const { text }: Props = $props()

  const shareData = $derived<ShareData>({ text, title: PUBLIC_APPLICATION_NAME, url: page.url.href })
  // The Web Share API needs a platform that can share this data (mostly mobile);
  // elsewhere the button falls back to copying the URL to the clipboard.
  const canShare = $derived(browser && navigator.canShare?.(shareData) === true)

  const clip = createCopyButton()

  // Rejects when the user dismisses the share sheet; nothing to recover from.
  const share = () => void navigator.share(shareData).catch(() => {})
</script>

<button
  type="button"
  class="btn preset-tonal btn-lg h-12 w-12 px-0"
  aria-label={canShare ? m.share_share() : clip.copied ? m.share_linkCopied() : m.share_copyLink()}
  onclick={canShare ? share : () => clip.copy(page.url.href)}
>
  <Icon name={clip.copied ? 'check' : 'share'} size={19} />
</button>
