// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve('src')

/** Every PowerSync twin under `src/`, tests excluded, as the `$lib`-relative path `twins.ts` names it by. */
function twins(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return twins(full)
    return /\.powersync\.(svelte\.)?ts$/.test(entry.name) ? [path.relative(path.join(SRC, 'lib'), full)] : []
  })
}

describe('twins.ts', () => {
  it('holds every twin to its Zero sibling', () => {
    const contract = readFileSync(path.join(SRC, 'lib/powersync/twins.ts'), 'utf8')
    const unchecked = twins().filter((file) => !contract.includes(`'$lib/${file.replace(/\.ts$/, '')}'`))

    expect(unchecked).toEqual([])
  })
})
