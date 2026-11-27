<script lang="ts">
  import { page } from '$app/state'
  import { ACTION_TOOL, ACTION_TOOL_LABEL } from '$lib/components/ActionBar/ActionBar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import KbdTooltip from '$lib/components/KbdTooltip/KbdTooltip.svelte'
  import { m } from '$lib/paraglide/messages'
  import { createShare } from '$lib/state/clipboard.svelte'

  /** Stays in the action row, not the menu: installed as a PWA there is no URL bar to copy from. */
  interface Props {
    /** Text shared alongside the current page URL. */
    text: string
  }

  const { text }: Props = $props()

  const sharing = createShare(
    () => text,
    () => page.url.href,
  )

  // Label and accessible name stay "Share" so voice control can target the visible word (WCAG 2.5.3).
  // The clipboard fallback rides on the tooltip and the icon instead of renaming the control.
  const action = $derived(
    sharing.canShare ? m.share_share() : sharing.copied ? m.share_linkCopied() : m.share_copyLink(),
  )
</script>

{#snippet button(attributes: Record<string, unknown>)}
  <button
    {...attributes}
    aria-label={m.share_share()}
    class={ACTION_TOOL}
    onclick={sharing.canShare ? sharing.share : sharing.copy}
    type="button"
  >
    <Icon name={sharing.copied ? 'check' : 'share'} size={19} />
    <span class={ACTION_TOOL_LABEL}>{m.share_share()}</span>
  </button>
{/snippet}

{#if action === m.share_share()}
  <!-- Web Share available, so the tooltip would only repeat the visible word. -->
  {@render button({})}
{:else}
  <KbdTooltip label={action}>
    {#snippet trigger(attributes)}
      {@render button(attributes)}
    {/snippet}
  </KbdTooltip>
{/if}
