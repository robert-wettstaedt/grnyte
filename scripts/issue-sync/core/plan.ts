import { MARKER } from './render'
import type { Status } from './types'

/** At most one write per issue per minute. */
const THROTTLE_MS = 60_000

export type CommentPlan =
  { at: number; kind: 'defer' } | { id: number; kind: 'update' } | { kind: 'create' } | { kind: 'skip' }

export interface Fields {
  Open: number
  Worktree: string
}

export interface IssueProgress {
  isOpen: boolean
  /** The repository's statuses, or undefined where GitHub offers none. */
  options?: StatusOption[]
  status?: string
}

export interface StatusOption {
  id: string
  name: string
  /** Whether an issue in this status is open or closed. */
  state?: 'CLOSED' | 'OPEN'
}

export type StatusPlan = { id: string; kind: 'set' } | { kind: 'skip' } | { kind: 'unavailable' }

/** What to do with the issue's comment: only ever the token user's own marked one. */
export function planComment(
  existing: { author: string; body: string; id: number }[],
  self: string,
  body: string,
  lastWrite: number | undefined,
  now: number,
): CommentPlan {
  const own = existing.find((comment) => comment.author === self && comment.body.startsWith(MARKER))
  if (own?.body === body) return { kind: 'skip' }
  if (lastWrite != null && now - lastWrite < THROTTLE_MS) return { at: lastWrite + THROTTLE_MS, kind: 'defer' }
  return own == null ? { kind: 'create' } : { id: own.id, kind: 'update' }
}

export function planFields(
  current: Partial<Fields>,
  desired: Fields,
): { field: keyof Fields; value: number | string }[] {
  return (Object.keys(desired) as (keyof Fields)[])
    .filter((field) => current[field] !== desired[field])
    .map((field) => ({ field, value: desired[field] }))
}

/** Add a `[later]` issue to the project only when it is a follow-up of this issue and was never added before. */
export function planFollowup(
  issue: { body: string; number: number },
  parent: number,
  state: { added: Set<number>; onProject: boolean },
): 'add' | 'skip' {
  if (state.onProject || state.added.has(issue.number)) return 'skip'
  return new RegExp(`^follow-up to #${parent}(?!\\d)`).test(issue.body) ? 'add' : 'skip'
}

/** Setting a status opens or closes the issue to match, so a closed issue and a closing status are never touched. */
export function planStatus(issue: IssueProgress, wanted: Status): StatusPlan {
  if (!issue.isOpen || issue.status === wanted) return { kind: 'skip' }
  const option = issue.options?.find((candidate) => candidate.name === wanted && candidate.state === 'OPEN')
  return option == null ? { kind: 'unavailable' } : { id: option.id, kind: 'set' }
}
