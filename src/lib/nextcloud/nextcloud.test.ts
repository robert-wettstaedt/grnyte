import { getNextcloud, loadFiles, searchNextcloudFile } from '$lib/nextcloud/nextcloud.server'
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

  describe('searchNextcloudFile', () => {
    it('should find a file by path', async () => {
      const result = await searchNextcloudFile({
        id: '1',
        path: '/test/image.jpg',
        areaFk: null,
        ascentFk: null,
        blockFk: null,
        routeFk: null,
        bunnyStreamFk: null,
        visibility: null,
        regionFk: 1,
      })
      expect(result).toEqual({ ...mockFileStat, filename: mockFileStat.filename })
    })

    it('should throw for non-existent file', async () => {
      await expect(
        searchNextcloudFile({
          id: '1',
          path: '/non-existent.jpg',
          areaFk: null,
          ascentFk: null,
          blockFk: null,
          routeFk: null,
          bunnyStreamFk: null,
          visibility: null,
          regionFk: 1,
        }),
      ).rejects.toThrowError()
    })
  })

  describe('loadFiles', () => {
    it('should load multiple files', async () => {
      const paths = [
        {
          id: '1',
          path: '/test/image.jpg',
          areaFk: null,
          ascentFk: null,
          blockFk: null,
          routeFk: null,
          visibility: null,
          bunnyStreamFk: null,
          regionFk: 1,
        },
        {
          id: '2',
          path: '/test/image2.jpg',
          areaFk: null,
          ascentFk: null,
          blockFk: null,
          routeFk: null,
          visibility: null,
          bunnyStreamFk: null,
          regionFk: 1,
        },
      ]
      const results = await loadFiles(paths)
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({
        ...paths[0],
        error: undefined,
        stat: { ...mockFileStat, filename: mockFileStat.filename },
      })
    })

    it('should handle missing files', async () => {
      vi.mocked(getNextcloud()).exists.mockResolvedValueOnce(false)
      const paths = [
        {
          id: '1',
          path: '/test/image.jpg',
          areaFk: null,
          ascentFk: null,
          blockFk: null,
          routeFk: null,
          bunnyStreamFk: null,
          visibility: null,
          regionFk: 1,
        },
        {
          id: '1',
          path: '/non-existent.jpg',
          areaFk: null,
          ascentFk: null,
          blockFk: null,
          routeFk: null,
          bunnyStreamFk: null,
          visibility: null,
          regionFk: 1,
        },
      ]
      const results = await loadFiles(paths)
      expect(results).toHaveLength(2)
      expect(results[1].error).not.toBeNull()
    })

    it('should handle empty path array', async () => {
      const results = await loadFiles([])
      expect(results).toHaveLength(0)
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
