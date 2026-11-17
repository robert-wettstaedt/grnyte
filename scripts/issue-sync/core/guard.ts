/** Personal or environment details that never go into a public issue. */
const PATTERNS = [
  // The domain ends in letters, so a pinned version such as `react@18.3.1` is not an address.
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}(?![A-Za-z])/,
  // Real keys run 30+ characters; a short tail is a placeholder such as `sb_secret_test`.
  /\b(?:ghp|gho|ghs|ghu|github_pat|sb_secret|sb_publishable)_\w{20,}/,
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  // IPv4, except loopback and the documentation ranges (RFC 5737) tests use as examples.
  /\b(?!127\.|0\.0\.0\.0\b|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\/(?:Users|private|tmp|var\/folders)\//,
  /-Users-\w/, // a sandbox path hides the username in a segment
]

export function guard(texts: string[], denylist: string[]): { kept: string[]; withheld: string[] } {
  const kept: string[] = []
  const withheld: string[] = []
  for (const text of texts) (isPrivate(text, denylist) ? withheld : kept).push(text)
  return { kept, withheld }
}

export function isPrivate(text: string, denylist: string[]): boolean {
  const lower = text.toLowerCase()
  return PATTERNS.some((pattern) => pattern.test(text)) || denylist.some((term) => lower.includes(term.toLowerCase()))
}
