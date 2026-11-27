import type { ChangeCopy, ChangeView } from './types'

export interface Collected {
  byIssue: Map<number, ChangeView[]>
  unlinked: ChangeView[]
}

const doneCount = (change: ChangeCopy) => change.tasks.filter((task) => task.done).length

export function collect(copies: ChangeCopy[]): Collected {
  const byName = Map.groupBy(copies, (change) => change.name)
  const picks = [...byName.values()].map((group) => group.toSorted(rank)[0])
  const byIssue = new Map<number, ChangeView[]>()
  const unlinked: ChangeView[] = []
  for (const pick of picks.toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (pick.issue == null) unlinked.push(pick)
    else byIssue.set(pick.issue, [...(byIssue.get(pick.issue) ?? []), pick])
  }
  return { byIssue, unlinked }
}

function rank(a: ChangeCopy, b: ChangeCopy): number {
  const onIssueBranch = (change: ChangeCopy) =>
    change.issue != null && change.branch.startsWith(`feature/${change.issue}-`) ? 1 : 0
  return (
    Number(b.archived) - Number(a.archived) ||
    doneCount(b) - doneCount(a) ||
    onIssueBranch(b) - onIssueBranch(a) ||
    Number(b.isMain) - Number(a.isMain) ||
    a.rootOrder - b.rootOrder
  )
}
