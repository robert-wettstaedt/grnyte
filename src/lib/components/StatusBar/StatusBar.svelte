<script module lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { isOnline } from '$lib/state/online.svelte'
  import { isUpdateReady } from '$lib/state/updateReady.svelte'
  import { isTerminal, RECONNECT_HOLD_MS, type ConnectionName } from '$lib/zero/connection'
  import { getZ } from '$lib/zero/z.svelte'
  import { resolveStatus } from './statusBar'

  // Supabase rotates the token hourly and Zero can pass through `needs-auth` on the
  // way back up, so a zero-delay red bar would flash on every slow handoff.
  const TERMINAL_HOLD_MS = 3_000
</script>

<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  // These props exist only so the story can show states that are near-impossible to
  // trigger live (`needs-auth`, `closed`, a deploy mid-session). Unset, the bar reads the
  // real device, the real Zero connection and the real service worker.
  interface Props {
    connectionState?: { name: ConnectionName }
    /** Overrides the hold below. A story pinning a state has already waited for it, and
     *  10s of blank canvas reads as a broken story rather than as a deliberate delay. */
    holdMs?: number
    online?: boolean
    updateReady?: boolean
  }

  const props: Props = $props()

  let settled = $state<ConnectionName>('connected')

  // The shared signal rather than a local `navigator.onLine` pair: that flag reads true on a fresh
  // document load with the network already dead, so the bar would say "reconnecting" to somebody
  // with no signal at all while the screen behind it said "not downloaded". `isOnline()` folds Zero's
  // connection in alongside the browser flag and the reachability probe; `settled` reads Zero alone.
  const online = $derived(props.online ?? isOnline())
  const raw = $derived(props.connectionState?.name ?? getZ().connectionState.name)

  // Hold a non-connected state for its threshold before showing anything: every
  // change restarts the timer, so flapping never reaches the bar.
  $effect(() => {
    if (raw === 'connected') {
      settled = raw
      return
    }

    const hold = props.holdMs ?? (isTerminal(raw) ? TERMINAL_HOLD_MS : RECONNECT_HOLD_MS)
    const timer = setTimeout(() => (settled = raw), hold)
    return () => clearTimeout(timer)
  })

  const updateReady = $derived(props.updateReady ?? isUpdateReady())

  const status = $derived(resolveStatus(online, settled, updateReady))
</script>

{#if status != null}
  <div class="flex items-center gap-2 px-4 py-2 text-sm {status.tone}" role={status.role}>
    <Icon name={status.icon} size={16} />

    <span class="min-w-0 flex-1 text-pretty">{status.message()}</span>

    {#if status.action === 'reload'}
      <button class="btn btn-sm preset-tonal" onclick={() => location.reload()}>{m.status_reload()}</button>
    {/if}
  </div>
{/if}
