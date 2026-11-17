import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { toTasks, type ApplyJson } from '../core/tasks'
import type { ChangeCopy, TaskItem } from '../core/types'
import { OPENSPEC_VERSION } from '../core/version'
import { archiveName, type Root } from './git'

const openspec = (cwd: string, args: string[]): unknown =>
  JSON.parse(
    execFileSync('npx', ['-y', `@fission-ai/openspec@${OPENSPEC_VERSION}`, ...args, '--json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )

/** Each CLI call costs over a second, so the watcher reruns it only for a `tasks.md` that changed. */
const taskCache = new Map<string, { mtimeMs: number; tasks: TaskItem[] }>()

/** A change whose files could not be read; its issue, when known, is left alone for the pass. */
export interface Unreadable {
  error: string
  issue?: number
  name: string
}

interface Meta {
  issue?: number
  paths?: string[]
}

/** Reads each change on its own, so one broken `.openspec.yaml` or CLI failure stops only that change. */
export function changesIn(
  root: Root,
  archivedUpstream: Set<string>,
): { copies: ChangeCopy[]; unreadable: Unreadable[] } {
  const copies: ChangeCopy[] = []
  const unreadable: Unreadable[] = []
  const changesDir = path.join(root.path, 'openspec', 'changes')
  if (!existsSync(changesDir)) return { copies, unreadable }
  const base = { branch: root.branch, isMain: root.isMain, root: root.path, rootOrder: root.order }
  const read = (name: string, dir: string, make: (meta: Meta) => ChangeCopy) => {
    let meta: Meta = {}
    try {
      meta = readMeta(dir)
      copies.push(make(meta))
    } catch (error) {
      unreadable.push({
        error: (error instanceof Error ? error.message : String(error)).split('\n')[0],
        issue: meta.issue ?? issueInText(dir),
        name,
      })
    }
  }

  for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive' || entry.name.startsWith('.')) continue
    const tasksFile = path.join(changesDir, entry.name, 'tasks.md')
    read(entry.name, path.join(changesDir, entry.name), (meta) => {
      const hasTasksFile = existsSync(tasksFile)
      const tasks = hasTasksFile ? tasksOf(root.path, entry.name, tasksFile) : []
      return { ...base, ...meta, archived: archivedUpstream.has(entry.name), hasTasksFile, name: entry.name, tasks }
    })
  }

  const archiveDir = path.join(changesDir, 'archive')
  for (const entry of existsSync(archiveDir) ? readdirSync(archiveDir, { withFileTypes: true }) : []) {
    const name = archiveName(entry.name)
    if (!entry.isDirectory() || name == null) continue
    read(name, path.join(archiveDir, entry.name), (meta) => ({
      ...base,
      ...meta,
      archived: true,
      hasTasksFile: true,
      name,
      tasks: [],
    }))
  }

  return { copies, unreadable }
}

/** The `x-issue` line of a `.openspec.yaml` that does not parse, so its issue can still wait. */
function issueInText(dir: string): number | undefined {
  try {
    const match = /^x-issue:\s*(\d+)\s*$/m.exec(readFileSync(path.join(dir, '.openspec.yaml'), 'utf8'))
    return match == null ? undefined : Number(match[1])
  } catch {
    return undefined
  }
}

function readMeta(dir: string): Meta {
  const file = path.join(dir, '.openspec.yaml')
  if (!existsSync(file)) return {}
  const meta = (parse(readFileSync(file, 'utf8')) ?? {}) as Record<string, unknown>
  const issue = typeof meta['x-issue'] === 'number' ? meta['x-issue'] : undefined
  const paths = Array.isArray(meta['x-paths']) ? meta['x-paths'].map(String) : undefined
  return { issue, paths }
}

function tasksOf(root: string, name: string, tasksFile: string): TaskItem[] {
  const { mtimeMs } = statSync(tasksFile)
  const cached = taskCache.get(tasksFile)
  if (cached?.mtimeMs === mtimeMs) return cached.tasks
  const tasks = toTasks(
    openspec(root, ['instructions', 'apply', '--change', name]) as ApplyJson,
    readFileSync(tasksFile, 'utf8'),
  )
  taskCache.set(tasksFile, { mtimeMs, tasks })
  return tasks
}
