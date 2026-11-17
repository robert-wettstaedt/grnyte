import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { collect } from '../core/collect'
import { gate, type GateResult } from '../core/gate'
import { deriveStatus } from '../core/progress'
import type { ChangeView, Status } from '../core/types'
import { archivedInDevelop, changedFiles, fetchDevelop, worktreeRoots } from './git'
import { changesIn, type Unreadable } from './openspec'

export const DENYLIST_FILE = path.join(homedir(), '.config', 'grnyte', 'issue-sync.json')

export interface Judged {
  status: Status
  view: ChangeView
  /** The root's folder name, or "main" for the main checkout. */
  worktree: string
}

export interface Local {
  byIssue: Map<number, Judged[]>
  /** Undefined when the pass did not try to fetch. */
  fetched?: boolean
  unlinked: Judged[]
  unreadable: Unreadable[]
}

/** Undefined when the file is missing: the sync then refuses to run. */
export function readDenylist(): string[] | undefined {
  if (!existsSync(DENYLIST_FILE)) return undefined
  let text: string
  try {
    text = readFileSync(DENYLIST_FILE, 'utf8')
  } catch {
    throw new Error(`cannot read ${DENYLIST_FILE}; inside the agent sandbox it needs read access`)
  }
  const { denylist } = JSON.parse(text) as { denylist?: unknown }
  if (!Array.isArray(denylist)) throw new Error(`${DENYLIST_FILE} needs { "denylist": [...] }`)
  return denylist.map(String)
}

/** `deriveStatus` decides archived and task-less changes before it reads the gate. */
const NO_GATE: GateResult = { failures: [], notes: [], pass: false }

export function readLocal(cwd: string, fetch: boolean): Local {
  const fetched = fetch ? fetchDevelop(cwd) : undefined
  const archived = archivedInDevelop(cwd)
  const roots = worktreeRoots(cwd).filter((root) => existsSync(root.path))
  const read = roots.map((root) => changesIn(root, archived))
  const { byIssue, unlinked } = collect(read.flatMap((result) => result.copies))
  const diffs = new Map<string, Error | string[]>()
  const diff = (root: string) => {
    if (!diffs.has(root)) {
      try {
        diffs.set(root, changedFiles(root))
      } catch (error) {
        diffs.set(root, error instanceof Error ? error : new Error(String(error)))
      }
    }
    return diffs.get(root) ?? []
  }

  const judge = (view: ChangeView): Judged => {
    const worktree = view.isMain ? 'main' : path.basename(view.root)
    if (view.archived || !view.hasTasksFile) return { status: deriveStatus(view, NO_GATE), view, worktree }
    const files = diff(view.root)
    const result: GateResult = Array.isArray(files)
      ? gate(view, files)
      : { failures: [`cannot diff against develop: ${files.message.split('\n')[0]}`], notes: [], pass: false }
    return { status: deriveStatus(view, result), view, worktree }
  }

  return {
    byIssue: new Map([...byIssue].map(([issue, views]) => [issue, views.map(judge)])),
    fetched,
    unlinked: unlinked.map(judge),
    unreadable: read.flatMap((result) => result.unreadable),
  }
}
