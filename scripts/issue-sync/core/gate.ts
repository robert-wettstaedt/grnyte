import path from 'node:path'
import { openMarker } from './discovered'
import type { ChangeView, TaskItem } from './types'

export interface GateResult {
  failures: string[]
  notes: string[]
  pass: boolean
}

/** Archiving writes these, so they are in scope for every change. */
const ALWAYS_IN_SCOPE = ['openspec/changes/archive/**', 'openspec/specs/**']

/** `dir/**` covers everything under `dir`, dotfiles too, which `path.matchesGlob`'s `**` skips. */
const inGlob = (file: string, glob: string) =>
  glob.endsWith('/**') ? file.startsWith(glob.slice(0, -2)) : path.matchesGlob(file, glob)

export function gate(change: ChangeView, changedFiles: string[]): GateResult {
  const failures: string[] = []
  const notes: string[] = []

  if (!change.hasTasksFile) failures.push('no tasks.md')
  else if (change.tasks.length === 0) failures.push('tasks.md lists no tasks')

  for (const task of change.tasks.filter((item) => !item.done)) {
    const judged = judgeOpen(task)
    if ('failure' in judged) failures.push(judged.failure)
    else notes.push(judged.note)
  }

  if (change.paths == null) notes.push('no x-paths declared: scope not checked')
  else failures.push(...outsideScope(change, changedFiles).map((file) => `outside x-paths: ${file}`))

  return { failures, notes, pass: failures.length === 0 }
}

function judgeOpen(task: TaskItem): { failure: string } | { note: string } {
  const found = openMarker(task)
  if (found == null) return { failure: `open task: ${task.description}` }
  const { issue, marker } = found
  if (marker === 'blocks-PR') return { failure: `open blocking item: ${task.description}` }
  if (marker === 'you') return { note: `waiting on you: ${task.description}` }
  if (issue == null) return { failure: `deferred item without an issue: ${task.description}` }
  return { note: `deferred to issue ${issue}: ${task.description}` }
}

function outsideScope(change: ChangeView, changedFiles: string[]): string[] {
  const scope = [...(change.paths ?? []), `openspec/changes/${change.name}/**`, ...ALWAYS_IN_SCOPE]
  return changedFiles.filter((file) => !scope.some((glob) => inGlob(file, glob)))
}
