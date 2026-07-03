<script lang="ts">
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** Text shared alongside the current page URL. */
    text: string
  }

  const { text }: Props = $props()

  // `navigator` is undefined during SSR and `navigator.share` only accepts data it
  // can share, so the button only appears when the platform supports the Web Share API.
  const shareData = $derived<ShareData>({ text, title: PUBLIC_APPLICATION_NAME, url: page.url.href })
  const canShare = $derived(browser && navigator.canShare?.(shareData) === true)

  // Rejects when the user dismisses the share sheet; nothing to recover from.
  const share = () => void navigator.share(shareData).catch(() => {})
</script>

{#if canShare}
  <button type="button" class="btn preset-tonal btn-lg h-12 w-12 px-0" aria-label={m.share_share()} onclick={share}>
    <Icon name="share" size={19} />
  </button>
{/if}
