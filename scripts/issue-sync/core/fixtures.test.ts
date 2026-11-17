import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OPENSPEC_VERSION } from './version'

const DIR = path.join(import.meta.dirname, 'fixtures')
const fixtures = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ data: JSON.parse(readFileSync(path.join(DIR, name), 'utf8')) as unknown, name }))

/** Every string anywhere in a JSON value. */
const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value != null && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : []

// A sandbox path hides the username as `-Users-<name>-`, which a plain `/Users/` search misses.
const LOCAL_PATH = /\/(?:Users|private|tmp|var\/folders)\/|-Users-/

describe('recorded OpenSpec fixtures', () => {
  it('were recorded from the pinned CLI', () => {
    expect(fixtures.length).toBeGreaterThan(0)
    for (const { data, name } of fixtures) {
      expect((data as { openspecVersion?: string }).openspecVersion, name).toBe(OPENSPEC_VERSION)
    }
  })

  it('hold no local path, so nothing of this machine reaches the public repo', () => {
    const leaks = fixtures.flatMap(({ data, name }) =>
      strings(data)
        .filter((value) => value.startsWith('/') || LOCAL_PATH.test(value))
        .map((value) => `${name}: ${value}`),
    )
    expect(leaks).toEqual([])
  })
})
