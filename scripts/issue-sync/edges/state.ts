import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** Outside every worktree, so nothing the sync remembers can be committed. */
const DIR = path.join(homedir(), 'Library', 'Application Support', 'grnyte-issue-sync')
const FILE = path.join(DIR, 'state.json')

export interface State {
  /** Follow-up issues the sync added to the project; never re-added once the developer removes one. */
  added: number[]
  errors: number
  issues: Record<string, { lastWrite?: number }>
  lastError?: string
  lastPass?: string
  /** Per change: a hash of its rendered section and when that last changed. */
  sections: Record<string, { changedAt: string; hash: string }>
}

/** `unreadable: 'empty'` is for runs that write nothing; a writing run without its state could re-add removed follow-ups. */
export function loadState(unreadable: 'empty' | 'throw' = 'throw'): State {
  const empty: State = { added: [], errors: 0, issues: {}, sections: {} }
  if (!existsSync(FILE)) return empty
  try {
    return { ...empty, ...(JSON.parse(readFileSync(FILE, 'utf8')) as Partial<State>) }
  } catch (error) {
    if (unreadable === 'empty') return empty
    throw error
  }
}

/** Write then rename, so an agent killed mid-write leaves the old state, never a truncated one. */
export function saveState(state: State): void {
  mkdirSync(DIR, { recursive: true })
  const temporary = `${FILE}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(temporary, FILE)
}
