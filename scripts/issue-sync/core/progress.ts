import type { GateResult } from './gate'
import type { ChangeView, Status } from './types'

/** Least advanced first, so a roll-up can take the minimum. */
const STATUSES: readonly Status[] = ['Backlog', 'Todo', 'In progress', 'In review']

/** Archiving precedes the merge, so an archived change must not close its issue: In review, never Done. */
export function deriveStatus(change: ChangeView, gateResult: GateResult): Status {
  if (change.archived) return 'In review'
  if (!change.hasTasksFile || change.tasks.length === 0) return 'Backlog'
  if (gateResult.pass) return 'In review'
  if (!change.tasks.some((task) => task.done)) return 'Todo'
  return 'In progress'
}

/** Every unchecked item, so deferred and waiting work stays visible as a number. */
export function openCount(change: ChangeView): number {
  return change.tasks.filter((task) => !task.done).length
}

export function rollUp(views: { open: number; status: Status }[]): { open: number; status: Status } {
  const status = STATUSES[Math.min(...views.map((view) => STATUSES.indexOf(view.status)))]
  return { open: views.reduce((sum, view) => sum + view.open, 0), status }
}
