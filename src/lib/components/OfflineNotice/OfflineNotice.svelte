<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { fade } from 'svelte/transition'

  /**
   * Stands in for a section whose data is deliberately not kept for offline use: events, changes,
   * reactions, other people's ascents. See `preloadForOffline` in `$lib/zero/z.svelte`.
   *
   * It exists so those sections cannot state an absence as a fact. "No grade opinions yet" and "event
   * not found" are claims about the crag; offline they are claims about the connection, and the two
   * must not look alike. Sized for a section, never the viewport, which is why this is not
   * `ErrorState` with its full-height tile and Reload button.
   *
   * Most callers get this through `QueryState`, which picks the wording from the resource's own
   * `availability`. Reach for it by hand only where the surrounding markup is not a `QueryState`
   * branch, and then say which of the two you mean.
   */
  const {
    compact = false,
    excluded = false,
  }: {
    compact?: boolean
    /**
     * True for data we deliberately do not keep offline, false for data that was not synced
     * to this device yet. Both are "not here", but only the second one comes back on its own, and
     * telling a reader to reconnect is only honest in that case.
     */
    excluded?: boolean
  } = $props()
</script>

<div
  class="text-surface-600-400 flex flex-col items-center gap-2 text-center {compact ? 'py-4' : 'py-8'}"
  in:fade={{ duration: 150 }}
>
  <Icon name="no-signal" size={compact ? '1.25rem' : '1.5rem'} />
  <p class="text-sm font-medium">{excluded ? m.error_offline_title() : m.error_notDownloaded_title()}</p>
  {#if !compact}
    <p class="max-w-prose text-sm">{excluded ? m.error_offline_body() : m.error_notDownloaded_body()}</p>
  {/if}
</div>
