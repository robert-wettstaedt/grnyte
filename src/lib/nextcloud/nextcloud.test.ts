import { getNextcloud } from '$lib/nextcloud/nextcloud.server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileStat } from 'webdav'

vi.mock('$lib/db/db.server.ts', () => ({}))

// Mock data
const mockFileStat: FileStat = {
  filename: '/test/image.jpg',
  basename: 'image.jpg',
  lastmod: new Date().toISOString(),
  size: 1024,
  type: 'file',
  etag: 'test-etag',
}

const mockFileContent = Buffer.from('test file content')

describe('NextCloud Integration', () => {
  beforeEach(() => {
    vi.mock('webdav', () => ({
      createClient: vi.fn().mockReturnValue({
        getFileContents: vi.fn(() => mockFileContent),
        putFileContents: vi.fn().mockResolvedValue(undefined),
        deleteFile: vi.fn().mockResolvedValue(undefined),
        getDirectoryContents: vi.fn(() => [mockFileStat]),
        stat: vi.fn((path) => {
          if (path.includes('non-existent')) {
            throw new Error('File not found')
          }
          return { data: mockFileStat }
        }),
        exists: vi.fn().mockResolvedValue(true),
        search: vi.fn(() => ({ data: { results: [mockFileStat] } })),
      }),
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getNextcloud', () => {
    it('should create and return a NextCloud client', () => {
      const client = getNextcloud()
      expect(client).toBeDefined()
      expect(client.getFileContents).toBeDefined()
      expect(client.putFileContents).toBeDefined()
    })

    it('should reuse the same client instance', () => {
      const client1 = getNextcloud()
      const client2 = getNextcloud()
      expect(client1).toBe(client2)
    })
  })

  describe('File Operations', () => {
    it('should upload a file', async () => {
      const client = getNextcloud()
      await expect(client.putFileContents('/test/new-image.jpg', mockFileContent)).resolves.not.toThrow()
    })

    it('should delete a file', async () => {
      const client = getNextcloud()
      await expect(client.deleteFile('/test/image.jpg')).resolves.not.toThrow()
    })

    it('should get directory contents', async () => {
      const client = getNextcloud()
      const contents = await client.getDirectoryContents('/test')
      expect(contents).toEqual([mockFileStat])
    })

    it('should handle file stats', async () => {
      const client = getNextcloud()
      const stat = await client.stat('/test/image.jpg')
      expect(stat).toEqual({ data: mockFileStat })
    })
  })
})
