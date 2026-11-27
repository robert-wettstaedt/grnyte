import { execFileSync } from 'node:child_process'

/** Never take `index.lock` for an optional refresh while an agent commits in the same worktree. */
const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0' }

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] })

export interface Root {
  branch: string
  isMain: boolean
  order: number
  path: string
}

/** The change name in an archive folder `<date>-<name>`. */
export const archiveName = (folder: string) => /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(folder)?.[1]

export function archivedInDevelop(cwd: string): Set<string> {
  const listing = git(cwd, ['ls-tree', '-d', '--name-only', 'origin/develop', 'openspec/changes/archive/'])
  return new Set(
    listing
      .split('\n')
      .map((line) => archiveName(line.split('/').at(-1) ?? ''))
      .filter((name): name is string => name != null),
  )
}

/**
 * Committed changes since the branch left `origin/develop`, plus uncommitted and untracked files. No rename
 * detection, so a move lists its source too; `-z` keeps paths unquoted.
 */
export function changedFiles(root: string): string[] {
  const entries = (out: string) => out.split('\0').filter(Boolean)
  const base = git(root, ['merge-base', 'origin/develop', 'HEAD']).trim()
  const committed = entries(git(root, ['diff', '--name-only', '-z', '--no-renames', base, 'HEAD']))
  const working = entries(git(root, ['status', '--porcelain', '-z', '--no-renames', '--untracked-files=all']))
    // Untracked `*-PLAN.md` is agent scratch (AGENTS.md); once tracked it counts like any other file.
    .filter((entry) => !(entry.startsWith('?? ') && entry.endsWith('-PLAN.md')))
    .map((entry) => entry.slice(3))
  return [...new Set([...committed, ...working])].sort()
}

/** False when the network refuses; the gate then diffs against the last fetched `develop`. */
export function fetchDevelop(cwd: string): boolean {
  try {
    git(cwd, ['fetch', '--quiet', 'origin', 'develop'])
    return true
  } catch {
    return false
  }
}

export const topLevel = (cwd = process.cwd()) => git(cwd, ['rev-parse', '--show-toplevel']).trim()

/** The main checkout first, as `git worktree list` orders them. */
export function worktreeRoots(cwd: string): Root[] {
  const blocks = git(cwd, ['worktree', 'list', '--porcelain']).trim().split('\n\n')
  return blocks.map((block, order) => {
    const field = (key: string) =>
      block
        .split('\n')
        .find((line) => line.startsWith(`${key} `))
        ?.slice(key.length + 1)
    return {
      branch: field('branch')?.replace(/^refs\/heads\//, '') ?? '',
      isMain: order === 0,
      order,
      path: field('worktree') ?? '',
    }
  })
}
