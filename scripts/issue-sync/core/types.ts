/** A change as one worktree root holds it. `root` is a local path and is never published. */
export interface ChangeCopy {
  /** Archived in this root's working tree or in the fetched `origin/develop`. */
  archived: boolean
  branch: string
  hasTasksFile: boolean
  isMain: boolean
  issue?: number
  name: string
  /** `x-paths`, or undefined for a change that declares none. */
  paths?: string[]
  root: string
  /** Position of the root in `git worktree list`. */
  rootOrder: number
  tasks: TaskItem[]
}

export type ChangeView = ChangeCopy

/** The GitHub issue statuses the sync sets; each keeps its issue open. */
export type Status = 'Backlog' | 'In progress' | 'In review' | 'Todo'

/** One task of a change, as OpenSpec lists it, with the `## ` heading it sits under. */
export interface TaskItem {
  description: string
  done: boolean
  group: string
}
