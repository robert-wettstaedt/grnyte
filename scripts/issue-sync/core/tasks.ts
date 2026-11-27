import type { TaskItem } from './types'

/** The part of `openspec instructions apply --json` the sync reads. */
export interface ApplyJson {
  tasks: { description: string; done: boolean; line: number }[]
}

/** OpenSpec's tasks, each with the `## ` heading above its line in `tasks.md`. Which lines are tasks stays OpenSpec's call. */
export function toTasks(apply: ApplyJson, tasksMd: string): TaskItem[] {
  const lines = tasksMd.split('\n')
  return apply.tasks.map(({ description, done, line }) => {
    const heading = lines
      .slice(0, line - 1)
      .findLast((text) => text.startsWith('## '))
      ?.slice(3)
      .trim()
    return { description, done, group: heading ?? '' }
  })
}
