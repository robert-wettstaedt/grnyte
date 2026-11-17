import { isPrivate } from '../core/guard'
import { openCount } from '../core/progress'
import { topLevel } from '../edges/git'
import { readDenylist, readLocal, type Judged } from '../edges/local'
import { loadState } from '../edges/state'

const denylist = readDenylist()
const local = readLocal(topLevel(), false)

const line = ({ status, view, worktree }: Judged) => {
  const withheld = denylist == null ? [] : view.tasks.filter((task) => isPrivate(task.description, denylist))
  const extra = withheld.map((task) => `\n      withheld: ${task.description}`).join('')
  return `  ${view.name} · ${view.archived ? 'Archived' : status} · ${openCount(view)} open · ${worktree} (${view.branch})${extra}`
}

for (const [issue, judged] of [...local.byIssue].sort(([a], [b]) => a - b))
  console.log(`issue ${issue}\n${judged.map(line).join('\n')}`)
console.log(`unlinked\n${local.unlinked.map(line).join('\n') || '  none'}`)
for (const entry of local.unreadable)
  console.log(`cannot read ${entry.name}${entry.issue == null ? '' : ` (issue ${entry.issue} waits)`}: ${entry.error}`)

if (denylist == null) console.log('denylist: missing, the sync refuses to run')
try {
  const state = loadState('throw')
  console.log(`last pass: ${state.lastPass ?? 'never'}`)
  console.log(
    `last error: ${state.lastError ?? 'none'}${state.errors > 0 ? ` (${state.errors} failed run(s) in a row)` : ''}`,
  )
} catch (error) {
  console.log(`state: unreadable, so the sync writes nothing (${error instanceof Error ? error.message : error})`)
}
