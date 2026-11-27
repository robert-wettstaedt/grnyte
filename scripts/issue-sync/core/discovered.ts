import type { TaskItem } from './types'

/** The task group that holds work found while applying a change. */
const DISCOVERED = 'Discovered'

type Marker = 'blocks-PR' | 'later' | 'you'

/** An open Discovered item's marker (an unmarked item blocks) and, for `[later]`, its issue; undefined otherwise. */
export function openMarker(task: TaskItem): undefined | { issue?: number; marker: Marker } {
  if (task.done || task.group !== DISCOVERED) return undefined
  const match = /^\[(blocks-PR|later|you)\]\s*(?:#(\d+))?/.exec(task.description)
  if (match == null) return { marker: 'blocks-PR' }
  const issue = match[2] == null ? undefined : Number(match[2])
  return { issue, marker: match[1] as Marker }
}
