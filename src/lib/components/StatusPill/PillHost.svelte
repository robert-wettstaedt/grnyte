<!--
  One surface's pill. A status waits 250 ms to appear and anything lingers 200 ms on leaving, so a
  fast answer shows nothing and a dependent query does not make it blink.
-->
<script lang="ts">
  import { m } from '$lib/paraglide/messages.js'
  import type { PillContent, PillOffer, PillSurface } from '$lib/state/pill.svelte'
  import { untrack } from 'svelte'
  import type { ClassValue } from 'svelte/elements'
  import StatusPill from './StatusPill.svelte'

  interface Props {
    /** Where it floats over the surface; it takes no space. */
    class?: ClassValue
    /** Inline placement for a position known only at runtime (below a measured header). */
    style?: string
    surface: PillSurface
  }

  const { class: placement = 'sticky top-2 z-20 h-0', style, surface }: Props = $props()

  const SHOW_DELAY_MS = 250
  const HIDE_LINGER_MS = 200

  const wanted = $derived(surface.content)
  const wanting = $derived(wanted != null)
  let shown = $state<PillContent>()

  // The delay runs from nothing wanted to something wanted, whatever kinds hand over meanwhile; the
  // linger from something to nothing.
  $effect(() => {
    if (!wanting) {
      const timer = setTimeout(() => (shown = undefined), HIDE_LINGER_MS)
      return () => clearTimeout(timer)
    }
    if (untrack(() => shown) == null) {
      const timer = setTimeout(() => (shown = untrack(() => wanted)), SHOW_DELAY_MS)
      return () => clearTimeout(timer)
    }
  })

  // Once shown, it follows the live offer, so the linger keeps the latest label; an action shows at once.
  $effect(() => {
    if (wanted != null && (untrack(() => shown) != null || wanted.kind === 'action')) {
      shown = wanted
    }
  })

  // A withdrawn action lingering on its way out does nothing when tapped.
  const current: PillContent | undefined = $derived(
    wanted == null && shown?.kind === 'action' ? { ...shown, onclick: () => {} } : shown,
  )
  const content: PillOffer | undefined = $derived(
    current?.kind === 'syncing' ? { kind: 'status', label: m.common_syncing() } : current,
  )
</script>

<!-- Mounted from the start, since a live region inserted with its text is often not announced. -->
<p class="sr-only" role="status">{content?.label ?? ''}</p>

{#if content}
  <StatusPill class={placement} {content} {style} />
{/if}
