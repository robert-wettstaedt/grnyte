<script module lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { isOnline } from '$lib/state/online.svelte'
  import { isUpdateReady } from '$lib/state/updateReady.svelte'
  import { getZ } from '$lib/zero/z.svelte'
  import { isAnnouncementActive, resolveStatus, TERMINAL, type Announcement } from './statusBar'

  // Supabase rotates the token hourly and Zero can pass through `needs-auth` on the
  // way back up, so a zero-delay red bar would flash on every slow handoff.
  const TERMINAL_HOLD_MS = 3_000
  // Zero retries every 5s and flaps through `connecting` on token refresh and tab wake.
  const TRANSIENT_HOLD_MS = 10_000

  const DISMISS_KEY = `${PUBLIC_APPLICATION_NAME}.dismissedAnnouncements`

  // ponytail: a constant, not a table. An outage notice would ride the same Zero
  // connection that is down, and the community-notice case only pays off once a
  // non-dev can post one, which needs an admin UI. The two ship together or not at all.
  const ANNOUNCEMENT: Announcement | null = null
</script>

<script lang="ts">
  import { browser } from '$app/environment'
  import { m } from '$lib/paraglide/messages'
  // These props exist only so the story can show states that are near-impossible to
  // trigger live (`needs-auth`, `closed`, an announcement, a deploy mid-session). Unset,
  // the bar reads the real device, the real Zero connection, the ANNOUNCEMENT constant
  // and the real service worker. The announcement comes in whole rather than as bare
  // copy so that dismissing it (which needs the id) works the same in the story as it
  // does in production.
  interface Props {
    announcement?: Announcement
    connectionState?: { name: string }
    /** Overrides the hold below. A story pinning a state has already waited for it, and
     *  10s of blank canvas reads as a broken story rather than as a deliberate delay. */
    holdMs?: number
    online?: boolean
    updateReady?: boolean
  }

  const props: Props = $props()

  // Writable `$derived`: `readDismissed` touches `localStorage` and nothing reactive, so this reads
  // once and then only ever changes when `dismiss()` assigns to it.
  let dismissed = $derived(browser ? readDismissed() : new Set<string>())
  let settled = $state('connected')

  // The shared signal rather than a local `navigator.onLine` pair: that flag reads true on a fresh
  // document load with the network already dead, so the bar would say "reconnecting" to somebody
  // with no signal at all while the screen behind it said "not downloaded". `isOnline()` folds Zero's
  // connection in alongside the browser flag and the reachability probe; `settled` reads Zero alone.
  const online = $derived(props.online ?? isOnline())
  const raw = $derived(props.connectionState?.name ?? getZ().connectionState.name)
  const announcement = $derived(props.announcement ?? ANNOUNCEMENT)

  // Hold a non-connected state for its threshold before showing anything: every
  // change restarts the timer, so flapping never reaches the bar.
  $effect(() => {
    if (raw === 'connected') {
      settled = raw
      return
    }

    const hold = props.holdMs ?? (TERMINAL.includes(raw) ? TERMINAL_HOLD_MS : TRANSIENT_HOLD_MS)
    const timer = setTimeout(() => (settled = raw), hold)
    return () => clearTimeout(timer)
  })

  // `Date.now()` is read whenever the bar re-evaluates, never on a timer: the window
  // is coarse enough that a notice outliving `endsAt` until the next state change or
  // navigation costs nothing, and a clock would re-render the whole frame every tick.
  const activeMessage = $derived(
    announcement != null && isAnnouncementActive(announcement, dismissed, Date.now()) ? announcement.message : null,
  )

  const updateReady = $derived(props.updateReady ?? isUpdateReady())

  const status = $derived(resolveStatus(online, settled, activeMessage, updateReady))

  function readDismissed() {
    return new Set((localStorage.getItem(DISMISS_KEY) ?? '').split(',').filter(Boolean))
  }

  function dismiss() {
    if (announcement == null) return

    // Re-read rather than reuse `dismissed`, so a dismissal made in another tab
    // since mount is not clobbered by this write.
    const ids = readDismissed().add(announcement.id)
    localStorage.setItem(DISMISS_KEY, [...ids].join(','))
    dismissed = ids
  }
</script>

{#if status != null}
  <div class="flex items-center gap-2 px-4 py-2 text-sm {status.tone}" role={status.role}>
    <Icon name={status.icon} size={16} />

    <span class="min-w-0 flex-1 text-pretty">{status.message()}</span>

    {#if status.action === 'reload'}
      <button class="btn btn-sm preset-tonal" onclick={() => location.reload()}>{m.status_reload()}</button>
    {:else if status.action === 'dismiss'}
      <button aria-label={m.status_dismiss()} class="btn-icon hover:preset-tonal" onclick={dismiss}>
        <Icon name="close" size={16} />
      </button>
    {/if}
  </div>
{/if}
