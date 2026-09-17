import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { Readable } from 'node:stream'
/**
 * The promotion loop runs concurrently, and a MOVE is one-way, so what needs pinning is that
 * concurrency changed nothing about WHICH files move: every candidate exactly once, never a path
 * twice, and never one whose `.orig` is smaller than the file it would replace.
 *
 * Storage is faked at the WebDAV client. `sharp` is faked too, so a "file" is just JSON naming its
 * own dimensions, which keeps the test about the loop rather than about image decoding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../schema'

const moveFile = vi.fn().mockResolvedValue(undefined)
const getDirectoryContents = vi.fn()
const getFileContents = vi.fn()

/** A stored "file" is the JSON its faked `sharp` will read back. */
const createReadStream = vi.fn((path: string) => {
  const pixels = contents.get(path.replace(/^user/, ''))
  return Readable.from([Buffer.from(JSON.stringify(pixels ?? { height: 1, width: 1 }))])
})

const contents = new Map<string, { height: number; width: number }>()

vi.mock('./nextcloud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nextcloud')>()),
  connectNextcloud: async () => ({
    dav: { createReadStream, getDirectoryContents, getFileContents, moveFile },
    userPath: (path: string) => `user${path}`,
  }),
}))

vi.mock('sharp', () => ({
  default: (buffer: Buffer) => ({ metadata: async () => JSON.parse(buffer.toString()) }),
}))

const { migrate } = await import('./migrate-promote-originals')

/** Drizzle's builder is only ever awaited here, so a thenable `from` is the whole surface used. */
const dbOf = (paths: string[]) =>
  ({
    select: () => ({ from: () => Promise.resolve(paths.map((path) => ({ path }))) }),
  }) as unknown as PostgresJsDatabase<typeof schema>

/** `count` images in one folder, each with an `.orig` sibling of `origPixels` against 1000x1000. */
const seed = (count: number, origPixels: (index: number) => { height: number; width: number }) => {
  const paths = Array.from({ length: count }, (_, index) => `/topos/${index}.jpg`)

  contents.clear()
  for (const [index, path] of paths.entries()) {
    contents.set(path, { height: 1000, width: 1000 })
    contents.set(path.replace('.jpg', '.orig.jpg'), origPixels(index))
  }

  getDirectoryContents.mockResolvedValue(
    [...contents.keys()].map((path) => ({ basename: path.split('/').pop(), type: 'file' })),
  )

  return paths
}

describe('migrate-promote-originals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    moveFile.mockResolvedValue(undefined)
  })

  // The pool hands paths out through one shared cursor. A cursor read that is not atomic with its
  // increment gives the same path to two workers, which promotes it twice.
  it('promotes every candidate exactly once', async () => {
    const paths = seed(24, () => ({ height: 2000, width: 2000 }))

    await migrate(dbOf(paths))

    const moved = moveFile.mock.calls.map(([from]) => from as string)
    expect(moved).toHaveLength(24)
    expect(new Set(moved).size).toBe(24)
    expect(new Set(moved)).toEqual(new Set(paths.map((path) => `user${path.replace('.jpg', '.orig.jpg')}`)))
  })

  // The guard that makes the one-way MOVE safe. Under concurrency it still has to be the SMALLER
  // orig that is refused, not whichever path happened to be in flight at the time.
  it('refuses a smaller orig while promoting the rest', async () => {
    const paths = seed(24, (index) => (index === 7 ? { height: 500, width: 500 } : { height: 2000, width: 2000 }))

    await migrate(dbOf(paths))

    const moved = moveFile.mock.calls.map(([from]) => from as string)
    expect(moved).toHaveLength(23)
    expect(moved).not.toContain('user/topos/7.orig.jpg')
  })

  it('moves nothing on a dry run', async () => {
    const paths = seed(8, () => ({ height: 2000, width: 2000 }))

    await migrate(dbOf(paths), { dryRun: true })

    expect(moveFile).not.toHaveBeenCalled()
  })

  it('leaves an image with no .orig sibling alone', async () => {
    const paths = seed(8, () => ({ height: 2000, width: 2000 }))
    contents.delete('/topos/3.orig.jpg')
    getDirectoryContents.mockResolvedValue(
      [...contents.keys()].map((path) => ({ basename: path.split('/').pop(), type: 'file' })),
    )

    await migrate(dbOf(paths))

    const moved = moveFile.mock.calls.map(([from]) => from as string)
    expect(moved).toHaveLength(7)
    expect(moved).not.toContain('user/topos/3.orig.jpg')
  })
})
