import { describe, expect, it } from 'vitest'
import { guard, isPrivate } from './guard'

const DENYLIST = ['zeus-mbp', 'Hetzner-Box']

describe('isPrivate', () => {
  it.each([
    ['an email', 'mail someone@example.org about it'],
    ['an email in markdown italics', 'ask _someone@example.com_ first'],
    ['a GitHub token', 'token ghp_0123456789abcdefABCDEF0123456789abcd'],
    ['a fine-grained GitHub token', 'github_pat_11ABCDEFG0123456789_abcdef'],
    ['a Supabase secret key', 'use sb_secret_N7UND0UgjKTVKUodkm0HgxSvEMPvzAbc'],
    ['a public address next to a documentation one', 'from 203.0.113.9 to 100.125.124.47'],
    ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'],
    ['a UUID', 'user 2dd3bdca-145a-4f11-b0d3-b830989a08a4 sees it'],
    ['an IPv4 address', 'ssh to 100.125.124.47 first'],
    ['a home path', 'open /Users/someone/notes.md'],
    ['a temp path', 'see /private/tmp/out.log and /tmp/x'],
    ['a macOS temp folder', 'in /var/folders/dg/abc/T/x'],
    ['a sandbox scratch segment', 'under claude-501/-Users-someone-workspaces-x'],
    ['a denylisted term in any case', 'deploy from ZEUS-MBP tonight'],
  ])('withholds %s', (_, text) => {
    expect(isPrivate(text, DENYLIST)).toBe(true)
  })

  it.each([
    ['a route number', 'route 203 stays'],
    ['a version', 'pin 1.27.2'],
    ['a date', 'since 2026-11-17'],
    ['a glob', 'stay inside `src/lib/**`'],
    ['an issue reference', 'see #1145'],
    ['a key placeholder', 'with an sb_secret_test key, or sb_secret_SENTINEL_9f3c'],
    ['a pinned package version', 'pin react@18.3.1 and @fission-ai/openspec@1.17.0'],
    ['the loopback address', 'bind 127.0.0.1:5432'],
    ['documentation addresses', 'forward 192.0.2.4, 198.51.100.7 and 203.0.113.1'],
  ])('keeps %s', (_, text) => {
    expect(isPrivate(text, DENYLIST)).toBe(false)
  })
})

describe('guard', () => {
  it('splits strings into kept and withheld, in order', () => {
    expect(guard(['fine', 'at /Users/x/y', 'also fine'], DENYLIST)).toEqual({
      kept: ['fine', 'also fine'],
      withheld: ['at /Users/x/y'],
    })
  })
})
