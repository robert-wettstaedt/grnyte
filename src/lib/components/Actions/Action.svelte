<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    /** When set, the action renders as a link; otherwise as a button. */
    href?: string
    /** Click handler for the button variant; ignored when `href` is set. */
    onclick?: () => void
    /** Disables the button variant (anchors can't be disabled natively). */
    disabled?: boolean
    children: Snippet
  }

  const { href, onclick, disabled = false, children }: Props = $props()

  // Shared so the link and button variants are visually identical. `shrink-0`
  // plus `whitespace-nowrap` keep each action at its natural size — so the
  // `Actions` bar wraps it to a new row (non-touch) or lets it overflow into the
  // scroll area (touch) rather than squashing the label. `snap-start` only bites
  // in the touch scroll layout.
  const className = 'btn btn-sm preset-tonal shrink-0 snap-start gap-2 whitespace-nowrap'
</script>

{#if href != null}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- generic pass-through; callers resolve() the href -->
  <a class={className} {href}>
    {@render children()}
  </a>
{:else}
  <button type="button" class={className} {disabled} {onclick}>
    {@render children()}
  </button>
{/if}
