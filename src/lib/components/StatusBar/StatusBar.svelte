<script module lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import { m } from '$lib/paraglide/messages'
  import { isOnline } from '$lib/state/online.svelte'
  import { getZ } from '$lib/zero/z.svelte'

  // Zero states that no reconnect loop recovers from: only a fresh client (i.e. a
  // reload, which also mints a fresh Supabase token) fixes them.
  const TERMINAL = ['closed', 'error', 'needs-auth']
  // Supabase rotates the token hourly and Zero can pass through `needs-auth` on the
  // way back up, so a zero-delay red bar would flash on every slow handoff.
  const TERMINAL_HOLD_MS = 3_000
  // Zero retries every 5s and flaps through `connecting` on token refresh and tab wake.
  const TRANSIENT_HOLD_MS = 10_000

  const DISMISS_KEY = `${PUBLIC_APPLICATION_NAME}.dismissedAnnouncements`

  export interface Announcement {
    /** Read with `Date.parse`, so an ISO date or datetime. */
    endsAt: string
    /** Remembered in `localStorage` once dismissed, so a new notice needs a new id. */
    id: string
    message: () => string
  }

  // ponytail: a constant, not a table. An outage notice would ride the same Zero
  // connection that is down, and the community-notice case only pays off once a
  // non-dev can post one, which needs an admin UI. The two ship together or not at all.
  const ANNOUNCEMENT: Announcement | null = null

  /**
   * Both halves are load-bearing: `endsAt` alone leaves a reader no way to close the
   * bar, a dismissal alone nags anyone who never taps the X until the next deploy.
   */
  export function isAnnouncementActive(announcement: Announcement, dismissed: Set<string>, now: number): boolean {
    return now < Date.parse(announcement.endsAt) && !dismissed.has(announcement.id)
  }

  export interface Status {
    action?: 'dismiss' | 'reload'
    icon: IconName
    message: () => string
    role: 'alert' | 'status'
    tone: string
  }

  /**
   * The single message to show, first match wins. `connection` is the settled Zero
   * connection state (see the holds above), `announcement` the active, undismissed
   * announcement copy or null.
   *
   * Offline suppresses the reconnecting branch but not the terminal one, which is the only branch
   * carrying an action. See the ordering note in the body.
   */
  export function resolveStatus(
    online: boolean,
    connection: string,
    announcement: (() => string) | null,
  ): null | Status {
    // Terminal first, offline second. These states carry the only action the bar ever offers, and
    // the offline branch has none: a reader whose sync is dead and whose reachability flag happens
    // to be stale got the actionless "you're offline" bar with the reload button hidden behind it.
    // Being told the wrong cause is survivable; being shown no way out is not.
    if (TERMINAL.includes(connection)) {
      return {
        action: 'reload',
        icon: 'alert-triangle',
        message: m.status_notSyncing,
        role: 'alert',
        tone: 'preset-tonal-error',
      }
    }

    // Then offline, which is the more specific and more actionable diagnosis of a sync that is not
    // running, and which keeps "not syncing" honestly meaning "your net is fine, ours is not".
    if (!online) {
      return { icon: 'no-signal', message: m.status_offline, role: 'status', tone: 'preset-tonal-warning' }
    }

    if (connection !== 'connected') {
      return { icon: 'alert-triangle', message: m.status_reconnecting, role: 'status', tone: 'preset-tonal-warning' }
    }

    if (announcement != null) {
      // ponytail: no `info` colour ramp exists, the brand purple stands in.
      return { action: 'dismiss', icon: 'info', message: announcement, role: 'status', tone: 'preset-tonal-primary' }
    }

    return null
  }
</script>

<script lang="ts">
  import { browser } from '$app/environment'
  // All four props exist only so the story can show states that are near-impossible
  // to trigger live (`needs-auth`, `closed`, an announcement). Unset, the bar reads
  // the real device, the real Zero connection and the ANNOUNCEMENT constant. The
  // announcement comes in whole rather than as bare copy so that dismissing it -
  // which needs the id - works the same in the story as it does in production.
  interface Props {
    announcement?: Announcement
    connectionState?: { name: string }
    /** Overrides the hold below. A story pinning a state has already waited for it, and
     *  10s of blank canvas reads as a broken story rather than as a deliberate delay. */
    holdMs?: number
    online?: boolean
  }

  const props: Props = $props()

  // Writable `$derived`: `readDismissed` touches `localStorage` and nothing reactive, so this reads
  // once and then only ever changes when `dismiss()` assigns to it.
  let dismissed = $derived(browser ? readDismissed() : new Set<string>())
  let settled = $state('connected')

  // The shared signal rather than a local `navigator.onLine` pair: that flag reads true on a fresh
  // document load with the network already dead, so the bar would say "reconnecting" to somebody
  // with no signal at all while the screen behind it said "not downloaded". `isOnline()` folds
  // Zero's own connection in, which is the same evidence `settled` below is built from.
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

  const status = $derived(resolveStatus(online, settled, activeMessage))

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
