<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { isUpdateReady } from '$lib/state/updateReady.svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { scale } from 'svelte/transition'

  /**
   * "This tab is running an older build." Absolutely positioned, so its anchor must be `relative`.
   *
   * A glyph, not a coloured dot: green reads as the online light and `NavIcon` already spends a
   * `primary` dot on unread, so colour alone cannot say which this is (WCAG 1.4.1). `sync` matches
   * StatusBar's "Reload" button for the same state, and is unused elsewhere in visible chrome.
   *
   * Unlike the StatusBar it does not rank below offline. The bar has one slot and picks the most
   * urgent; this is a persistent affordance, and a reload works offline off the new precache.
   */
  interface Props {
    /** Story-only. Live this needs a deploy mid-session, and dev cannot reach it at all:
     *  `updated.check()` is hardcoded false there, so the flag disarms before anything paints. */
    updateReady?: boolean
  }

  const props: Props = $props()

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)
  const visible = $derived(props.updateReady ?? isUpdateReady())
</script>

{#if visible}
  <span
    aria-hidden="true"
    class="bg-surface-50-950 text-surface-950-50 ring-surface-950-50 absolute -inset-e-1 -top-1 grid size-3.5 place-items-center rounded-full ring-2"
    transition:scale={{ duration }}
  >
    <Icon name="sync" size={9} />
  </span>

  <span class="sr-only">{m.status_updateReady()}</span>
{/if}
