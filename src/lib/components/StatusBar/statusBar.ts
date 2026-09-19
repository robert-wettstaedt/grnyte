/**
 * What the status bar decides, apart from how it draws it.
 *
 * Out of `StatusBar.svelte` so it is reachable: `mutate` globs only ever match `*.ts`, so logic
 * with a rule this specific was unmutatable while it lived in a `<script module>` block.
 */
import type { IconName } from '$lib/components/Icon/icons'
import { m } from '$lib/paraglide/messages'

// Zero states that no reconnect loop recovers from: only a fresh client (i.e. a
// reload, which also mints a fresh Supabase token) fixes them.
export const TERMINAL = ['closed', 'error', 'needs-auth']

export interface Announcement {
  /** Read with `Date.parse`, so an ISO date or datetime. */
  endsAt: string
  /** Remembered in `localStorage` once dismissed, so a new notice needs a new id. */
  id: string
  message: () => string
}

export interface Status {
  action?: 'dismiss' | 'reload'
  icon: IconName
  message: () => string
  role: 'alert' | 'status'
  tone: string
}

/**
 * Both halves are load-bearing: `endsAt` alone leaves a reader no way to close the
 * bar, a dismissal alone nags anyone who never taps the X until the next deploy.
 */
export function isAnnouncementActive(announcement: Announcement, dismissed: Set<string>, now: number): boolean {
  return now < Date.parse(announcement.endsAt) && !dismissed.has(announcement.id)
}

/**
 * The single message to show, first match wins. `connection` is the settled Zero
 * connection state (see the holds in the component), `announcement` the active, undismissed
 * announcement copy or null.
 *
 * Offline suppresses the reconnecting branch but not the terminal one, which is the only branch
 * carrying an action. See the ordering note in the body.
 */
export function resolveStatus(
  online: boolean,
  connection: string,
  announcement: (() => string) | null,
  updateReady: boolean,
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

  // Last: the swap happens by itself at the next screen change, so this is for the reader parked
  // on one screen. An admin announcement is time-boxed and outranks a routine update notice.
  if (updateReady) {
    return {
      action: 'reload',
      icon: 'info',
      message: m.status_updateReady,
      role: 'status',
      tone: 'preset-tonal-primary',
    }
  }

  return null
}
