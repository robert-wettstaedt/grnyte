import { gate } from '../core/gate'
import { archivedInDevelop, changedFiles, fetchDevelop, topLevel, worktreeRoots } from '../edges/git'
import { changesIn } from '../edges/openspec'

const name = process.argv[2]
if (name == null) {
  console.error('usage: npm run issues:gate -- <change>')
  process.exit(2)
}

const top = topLevel()
const fetched = fetchDevelop(top)
const root = worktreeRoots(top).find((candidate) => candidate.path === top)
const read = root && changesIn(root, archivedInDevelop(top))
const broken = read?.unreadable.find((entry) => entry.name === name)
if (broken != null) {
  console.error(`cannot read change "${name}": ${broken.error}`)
  process.exit(2)
}
const change = read?.copies.find((copy) => copy.name === name && !copy.archived)
if (change == null) {
  console.error(`no active change "${name}" in this worktree`)
  process.exit(2)
}

const result = gate(change, changedFiles(top))
console.log(`base: origin/develop${fetched ? '' : ' (not fetched: the last fetched state)'}`)
for (const failure of result.failures) console.log(`FAIL  ${failure}`)
for (const note of result.notes) console.log(`note  ${note}`)
console.log(result.pass ? 'ready for a pull request' : `not ready: ${result.failures.length} reason(s)`)
process.exit(result.pass ? 0 : 1)
