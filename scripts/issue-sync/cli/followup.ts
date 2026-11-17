// Uses the caller's own `gh` token (Issues write); the sync adds the issue to the project on its next pass.
import { execFileSync } from 'node:child_process'
import { isPrivate } from '../core/guard'
import { REPO } from '../edges/github'
import { DENYLIST_FILE, readDenylist } from '../edges/local'

const [parentArg, title] = process.argv.slice(2)
const parent = Number(parentArg)
if (!Number.isInteger(parent) || title == null || title.trim() === '') {
  console.error('usage: npm run issues:followup -- <parent issue> "<title>"')
  process.exit(2)
}

const denylist = readDenylist()
if (denylist == null) {
  console.error(`refusing: no denylist at ${DENYLIST_FILE}`)
  process.exit(2)
}
if (isPrivate(title, denylist)) {
  console.error(
    'refused: the title holds a personal or environment detail (path, address, key or denylisted term). Reword it.',
  )
  process.exit(1)
}

const created = JSON.parse(
  execFileSync('gh', ['api', '--method', 'POST', `repos/${REPO}/issues`, '--input', '-'], {
    encoding: 'utf8',
    input: JSON.stringify({ body: `follow-up to #${parent}`, title }),
  }),
) as { number: number }
console.log(created.number)
