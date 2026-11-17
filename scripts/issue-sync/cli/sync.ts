// Without `--once` it keeps watching: the `launchd` agent runs it that way.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { openMarker } from '../core/discovered'
import { isPrivate } from '../core/guard'
import { planComment, planFields, planFollowup, planStatus, type Fields } from '../core/plan'
import { openCount, rollUp } from '../core/progress'
import { renderComment, renderSection, type Section } from '../core/render'
import { topLevel, worktreeRoots } from '../edges/git'
import {
  addItem,
  createComment,
  FIELD_NAMES,
  issueOnProject,
  issueProgress,
  listComments,
  projectFields,
  self,
  setField,
  setStatus,
  updateComment,
  type ProjectField,
} from '../edges/github'
import { DENYLIST_FILE, readDenylist, readLocal, type Judged } from '../edges/local'
import { loadState, saveState, type State } from '../edges/state'
import { watchChanges } from '../edges/watch'

/** GitHub writes; a dry run swaps in one that writes nothing. */
interface Writer {
  addItem: (contentId: string) => void
  createComment: (issue: number, body: string) => void
  setField: (itemId: string, field: ProjectField, value: number | string) => void
  setStatus: (issueId: string, statusId: string) => void
  updateComment: (id: number, body: string) => void
}

const GITHUB: Writer = { addItem, createComment, setField, setStatus, updateComment }
const NO_WRITES: Writer = {
  addItem: () => undefined,
  createComment: () => undefined,
  setField: () => undefined,
  setStatus: () => undefined,
  updateComment: () => undefined,
}

interface Context {
  denylist: string[]
  field: (name: string) => ProjectField
  me: () => string
  now: number
  say: (line: string) => void
  state: State
  write: Writer
}

interface PassOptions {
  dryRun: boolean
  fetch: boolean
  issues?: Set<number>
}

const stamp = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

function laterIssues(judged: Judged[]): Set<number> {
  const markers = judged.flatMap(({ view }) => view.tasks.map(openMarker))
  return new Set(markers.flatMap((found) => (found?.marker === 'later' && found.issue != null ? [found.issue] : [])))
}

function notify(message: string): void {
  try {
    execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title "grnyte issue sync"`])
  } catch {
    // The log and `issues:status` still carry the error.
  }
}

/** One pass over the linked issues; returns the issues whose comment write waits for the end of its minute. */
function pass(top: string, denylist: string[], state: State, options: PassOptions) {
  const local = readLocal(top, options.fetch)
  let me: string | undefined
  let fields: ProjectField[] | undefined
  const ctx: Context = {
    denylist,
    field: (name) => {
      fields ??= projectFields()
      const found = fields.find((candidate) => candidate.name === name)
      if (found == null) throw new Error(`project field "${name}" is missing: run npm run issues:setup-project`)
      return found
    },
    me: () => (me ??= self()),
    now: Date.now(),
    say: (line) => console.log(`${options.dryRun ? '[dry run] ' : ''}${line}`),
    state,
    write: options.dryRun ? NO_WRITES : GITHUB,
  }

  const deferred = new Map<number, number>()
  const errors = local.unreadable.map((entry) => `cannot read change ${entry.name}: ${entry.error}`)
  // A section would vanish from the comment while its change cannot be read, so its issue waits.
  const readable = new Set([...[...local.byIssue.values()].flat(), ...local.unlinked].map((entry) => entry.view.name))
  const blocked = new Set(
    local.unreadable.flatMap((entry) => (entry.issue == null || readable.has(entry.name) ? [] : [entry.issue])),
  )
  for (const [issue, judged] of local.byIssue) {
    if (options.issues != null && !options.issues.has(issue)) continue
    if (blocked.has(issue)) {
      ctx.say(`issue ${issue}: a linked change cannot be read, skipped`)
      continue
    }
    let onProject = false
    try {
      const info = issueOnProject(issue)
      if (info?.itemId == null) {
        ctx.say(`issue ${issue}: not on the roadmap project, skipped`)
        continue
      }
      onProject = true
      const at = syncComment(ctx, issue, judged)
      if (at != null) deferred.set(issue, at)
      syncFields(ctx, issue, { fields: info.fields, itemId: info.itemId }, judged)
      syncFollowups(ctx, issue, judged)
    } catch (error) {
      errors.push(`issue ${issue}: ${message(error)}`)
    }
    if (!onProject) continue
    // On its own, so neither the preview API nor a failed project write costs the other.
    try {
      syncStatus(ctx, issue, judged)
    } catch (error) {
      errors.push(`issue ${issue}, status: ${message(error)}`)
    }
  }
  return { deferred, errors, fetched: local.fetched }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n')[0]

/** Set once a writing run found its state unreadable, so the notification is posted once per process. */
let stateAlerted = false

/**
 * A pass with failure accounting: three failed runs in a row post one notification. Only a pass that
 * fetched resets the streak, so passes that skip the fetch cannot hide a fetch that keeps failing.
 */
function run(top: string, denylist: string[], options: PassOptions): Map<number, number> {
  let state: State
  try {
    state = loadState(options.dryRun ? 'empty' : 'throw')
  } catch (caught) {
    console.error(`cannot read the sync state, so this pass writes nothing: ${message(caught)}`)
    if (!stateAlerted) notify('The sync state is unreadable; no pass writes until it is fixed or removed.')
    stateAlerted = true
    return new Map()
  }
  let error: string | undefined
  let deferred = new Map<number, number>()
  let fetched: boolean | undefined
  try {
    const result = pass(top, denylist, state, options)
    deferred = result.deferred
    fetched = result.fetched
    const problems = [
      ...(fetched === false ? ['could not fetch develop; the gate used the last fetched develop'] : []),
      ...result.errors,
    ]
    if (problems.length > 0) error = problems.join('; ')
  } catch (caught) {
    error = message(caught)
  }
  if (options.dryRun) {
    if (error != null) console.error(error)
    return deferred
  }
  state.lastPass = new Date().toISOString()
  if (error == null) {
    if (fetched === true) state.errors = 0
  } else {
    console.error(error)
    state.errors += 1
    state.lastError = `${state.lastPass} ${error}`
    if (state.errors === 3) notify(`Three failed runs in a row: ${error}`)
  }
  saveState(state)
  return deferred
}

/** A change's section, dated by when its rendered backlog last changed, never by this pass. */
function section(ctx: Context, issue: number, { status, view }: Judged): Section {
  for (const task of view.tasks.filter((item) => isPrivate(item.description, ctx.denylist)))
    ctx.say(`issue ${issue}, ${view.name}: withheld "${task.description}"`)
  const sectionHash = hash(renderSection({ change: view, changedAt: '', status }, ctx.denylist).join('\n'))
  const previous = ctx.state.sections[view.name]
  const changedAt = previous?.hash === sectionHash ? previous.changedAt : stamp(ctx.now)
  ctx.state.sections[view.name] = { changedAt, hash: sectionHash }
  return { change: view, changedAt, status }
}

/** Writes the issue's comment, or returns when the write may happen. */
function syncComment(ctx: Context, issue: number, judged: Judged[]): number | undefined {
  const body = renderComment(
    judged.map((entry) => section(ctx, issue, entry)),
    ctx.denylist,
  )
  const plan = planComment(listComments(issue), ctx.me(), body, ctx.state.issues[issue]?.lastWrite, ctx.now)
  if (plan.kind === 'skip') return void ctx.say(`issue ${issue}: comment is current`)
  if (plan.kind === 'defer') {
    ctx.say(`issue ${issue}: comment write deferred to ${stamp(plan.at)}`)
    return plan.at
  }
  ctx.say(`issue ${issue}: ${plan.kind} comment\n${body}\n`)
  if (plan.kind === 'create') ctx.write.createComment(issue, body)
  else ctx.write.updateComment(plan.id, body)
  ctx.state.issues[issue] = { lastWrite: ctx.now }
}

function syncFields(
  ctx: Context,
  issue: number,
  item: { fields: Partial<Fields>; itemId: string },
  judged: Judged[],
): void {
  const { open } = summary(judged)
  const worktrees = judged
    .filter((entry) => !entry.view.archived)
    .map((entry) => (isPrivate(entry.worktree, ctx.denylist) ? '(withheld)' : entry.worktree))
  const desired = { Open: open, Worktree: [...new Set(worktrees)].join(', ') || 'none' }
  for (const { field, value } of planFields(item.fields, desired)) {
    ctx.say(`issue ${issue}: set ${FIELD_NAMES[field]} to ${value}`)
    ctx.write.setField(item.itemId, ctx.field(FIELD_NAMES[field]), value)
  }
}

const summary = (judged: Judged[]) =>
  rollUp(judged.map((entry) => ({ open: openCount(entry.view), status: entry.status })))

function syncFollowups(ctx: Context, issue: number, judged: Judged[]): void {
  const added = new Set(ctx.state.added)
  for (const number of laterIssues(judged)) {
    let followup: ReturnType<typeof issueOnProject>
    try {
      followup = issueOnProject(number)
    } catch {
      ctx.say(`issue ${issue}: follow-up issue ${number} cannot be read, skipped`)
      continue
    }
    if (followup == null) continue
    if (planFollowup({ body: followup.body, number }, issue, { added, onProject: followup.itemId != null }) === 'skip')
      continue
    ctx.say(`issue ${issue}: add follow-up issue ${number} to the project`)
    ctx.write.addItem(followup.contentId)
    ctx.state.added.push(number)
  }
}

function syncStatus(ctx: Context, issue: number, judged: Judged[]): void {
  const wanted = summary(judged).status
  const current = issueProgress(issue)
  const plan = planStatus(current, wanted)
  if (plan.kind === 'unavailable') ctx.say(`issue ${issue}: GitHub offers no open status "${wanted}", status skipped`)
  if (plan.kind !== 'set') return
  ctx.say(`issue ${issue}: set status to ${wanted}`)
  ctx.write.setStatus(current.contentId, plan.id)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const issueArg = args.indexOf('--issue')
const only = issueArg >= 0 ? new Set([Number(args[issueArg + 1])]) : undefined
if (only != null && [...only].some((issue) => !Number.isInteger(issue))) {
  console.error('usage: --issue <number>')
  process.exit(2)
}

const denylist = readDenylist()
if (denylist == null) {
  console.error(`refusing to run: no denylist at ${DENYLIST_FILE}. Create it as { "denylist": ["<hostname>", ...] }.`)
  process.exit(2)
}

const top = topLevel()

if (args.includes('--once')) {
  let deferred = run(top, denylist, { dryRun, fetch: true, issues: only })
  while (deferred.size > 0 && !dryRun) {
    await sleep(Math.max(...deferred.values()) - Date.now())
    deferred = run(top, denylist, { dryRun, fetch: false, issues: new Set(deferred.keys()) })
  }
} else {
  const timers = new Map<number, NodeJS.Timeout>()
  const later = (deferred: Map<number, number>) => {
    for (const [issue, at] of deferred) {
      clearTimeout(timers.get(issue))
      timers.set(
        issue,
        setTimeout(() => {
          timers.delete(issue)
          later(run(top, denylist, { dryRun, fetch: false, issues: new Set([issue]) }))
        }, at - Date.now()),
      )
    }
  }
  watchChanges(
    () => worktreeRoots(top).map((root) => root.path),
    (full) => later(run(top, denylist, { dryRun, fetch: full, issues: only })),
  )
}
