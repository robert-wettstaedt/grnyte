import { execFileSync } from 'node:child_process'

export type TokenKind = 'issues' | 'project'

/** Issues and comments: fine-grained, Issues read/write. Project fields: classic with the `project` scope. */
const SERVICE: Record<TokenKind, string> = { issues: 'grnyte-issue-sync-issues', project: 'grnyte-issue-sync-project' }
/** For a shell that already holds the tokens, such as a dry run before the Keychain is set up. */
const ENV: Record<TokenKind, string> = { issues: 'GH_TOKEN', project: 'GH_PROJECT_TOKEN' }

// shortcut: read once per process, so a rotated token needs an agent restart.
const tokens = new Map<TokenKind, string>()

export function token(kind: TokenKind): string {
  if (!tokens.has(kind)) tokens.set(kind, read(kind))
  return tokens.get(kind) ?? ''
}

function read(kind: TokenKind): string {
  try {
    return execFileSync('security', ['find-generic-password', '-s', SERVICE[kind], '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    const fromEnv = process.env[ENV[kind]]
    if (fromEnv) return fromEnv
    throw new Error(`no ${kind} token: add it with security add-generic-password -s ${SERVICE[kind]} -a "$USER" -w`)
  }
}
