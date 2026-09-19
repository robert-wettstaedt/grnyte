import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Ties "node types that emit a URL" to "node types the guard checks", read from the handlers that
 * build the attribute. An upgrade adding a sixth url-bearing handler fails here, not in production.
 */
const GUARDED = ['image', 'imageReference', 'link', 'linkReference']

/** Emits only `#fn-<id>` / `#fnref-<id>` against the current document, so it carries no scheme. */
const FRAGMENT_ONLY = ['footnoteReference']

function handlersDir(): string {
  const entry = createRequire(import.meta.url).resolve('mdast-util-to-hast')
  return join(dirname(entry), 'lib', 'handlers')
}

const toNodeType = (file: string) => file.replace(/\.js$/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

describe('remarkSafeUrls node-type coverage', () => {
  const dir = handlersDir()

  it('finds the handler directory it is pinned to', () => {
    expect(readdirSync(dir)).toContain('link.js')
  })

  it('guards every node type that mdast-util-to-hast gives a url-bearing attribute', () => {
    const urlBearing = readdirSync(dir)
      .filter((file) => file.endsWith('.js') && file !== 'index.js')
      .filter((file) => /\b(href|src):/.test(readFileSync(join(dir, file), 'utf8')))
      .map(toNodeType)
      .filter((type) => !FRAGMENT_ONLY.includes(type))
      .sort()

    expect(urlBearing).toEqual(GUARDED)
  })

  it('checks each guarded type in the plugin source', () => {
    const source = readFileSync(join(import.meta.dirname, 'remark-safe-urls.ts'), 'utf8')

    for (const type of GUARDED) {
      expect(source).toContain(`node.type === '${type}'`)
    }
  })
})
