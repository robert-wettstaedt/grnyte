/**
 * What the status bar decides, apart from how it draws it.
 *
 * Out of `StatusBar.svelte` so it is reachable: `mutate` globs only ever match `*.ts`, so logic
 * with a rule this specific was unmutatable while it lived in a `<script module>` block.
 */
import type { IconName } from '$lib/components/Icon/icons'
import { m } from '$lib/paraglide/messages'
import type { ResumeState } from '$lib/powersync/resume'
import { isTerminal, type ConnectionName } from '$lib/zero/connection'

export interface Status {
  action?: 'reload'
  icon: IconName
  message: () => string
  role: 'alert' | 'status'
  tone: string
}

const NOT_SYNCING: Status = {
  action: 'reload',
  icon: 'alert-triangle',
  message: m.status_notSyncing,
  role: 'alert',
  tone: 'preset-tonal-error',
}

/**
 * The single message to show, first match wins. `connection` is the settled Zero
 * connection state (see the holds in the component).
 *
 * Offline suppresses the reconnecting and stalled branches but not the terminal one, the only one a
 * stale reachability flag could hide a way out behind. See the ordering note in the body.
 */
export function resolveStatus(
  online: boolean,
  connection: ConnectionName,
  updateReady: boolean,
  resume: ResumeState = 'idle',
): null | Status {
  // Terminal first, offline second. A terminal state carries a reload action, and
  // the offline branch has none: a reader whose sync is dead and whose reachability flag happens
  // to be stale got the actionless "you're offline" bar with the reload button hidden behind it.
  // Being told the wrong cause is survivable; being shown no way out is not.
  if (isTerminal(connection)) return NOT_SYNCING

  // Then offline, which is the more specific and more actionable diagnosis of a sync that is not
  // running, and which keeps "not syncing" honestly meaning "your net is fine, ours is not".
  if (!online) {
    return { icon: 'no-signal', message: m.status_offline, role: 'status', tone: 'preset-tonal-warning' }
  }

  if (connection !== 'connected') {
    return { icon: 'alert-triangle', message: m.status_reconnecting, role: 'status', tone: 'preset-tonal-warning' }
  }

  if (resume === 'stalled') return NOT_SYNCING
  if (resume === 'catchingUp') {
    return { icon: 'alert-triangle', message: m.status_catchingUp, role: 'status', tone: 'preset-tonal-warning' }
  }

  // Last: the swap happens by itself at the next screen change, so this is for the reader parked
  // on one screen.
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
