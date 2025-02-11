import { config } from '$lib/config'
import type { NestedEntityToStorageObject } from '$lib/db/types'
import { loadObject, loadObjects, deleteObject } from '$lib/storage.server'
import type { StorageClient } from '@supabase/storage-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Supabase client
const createSignedUrlMock = vi.fn()
const existsMock = vi.fn()
const removeMock = vi.fn()
const fromMock = vi.fn(() => ({
  createSignedUrl: createSignedUrlMock,
  exists: existsMock,
  remove: removeMock,
}))

const mockSupabase = {
  storage: {
    from: fromMock,
  } as unknown as StorageClient,
} as unknown as SupabaseClient

// Mock test data
const mockStorageObject = {
  id: 1,
  storageObjectId: 'test-1',
  areaFk: 1,
  ascentFk: 1,
  routeFk: 1,
  blockFk: 1,
  storageObject: {
    name: 'test-image.jpg',
    id: 'test-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    bucketId: 'files',
    lastAccessedAt: new Date('2024-01-01'),
    metadata: {
      cacheControl: '3600',
      contentLength: 1000,
      eTag: 'test-etag',
      httpStatusCode: 200,
      lastModified: '2024-01-01',
      mimetype: 'image/jpeg',
      size: 1000,
    },
    owner: 'test-user',
    pathTokens: ['test-image.jpg'],
    userMetadata: null,
    version: '1',
  },
} as NestedEntityToStorageObject

describe('Storage Server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadObject', () => {
    it('should load an image object successfully', async () => {
      const signedUrl = 'https://example.com/signed-url'
      createSignedUrlMock.mockResolvedValueOnce({ data: { signedUrl }, error: null })

      const result = await loadObject(mockSupabase, mockStorageObject)

      expect(fromMock).toHaveBeenCalledWith(config.files.buckets.files)
      expect(createSignedUrlMock).toHaveBeenCalledWith('test-image.jpg', 3600, {
        transform: { width: 800 },
      })
      expect(result.stat?.url).toBe(signedUrl)
      expect(result.error).toBeUndefined()
    })

    it('should handle video objects and create thumbnails', async () => {
      const videoObject: NestedEntityToStorageObject = {
        id: 1,
        storageObjectId: 'test-1',
        areaFk: 1,
        ascentFk: 1,
        routeFk: 1,
        blockFk: 1,
        storageObject: {
          name: 'test-video.mp4',
          id: 'test-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          bucketId: 'files',
          lastAccessedAt: new Date('2024-01-01'),
          metadata: {
            cacheControl: '3600',
            contentLength: 1000,
            eTag: 'test-etag',
            httpStatusCode: 200,
            lastModified: '2024-01-01',
            mimetype: 'video/mp4',
            size: 1000,
          },
          owner: 'test-user',
          pathTokens: ['test-video.mp4'],
          userMetadata: null,
          version: '1',
        },
      }

      const signedUrl = 'https://example.com/signed-url'
      const thumbnailUrl = 'https://example.com/thumbnail-url'
      createSignedUrlMock
        .mockResolvedValueOnce({ data: { signedUrl }, error: null })
        .mockResolvedValueOnce({ data: { signedUrl: thumbnailUrl }, error: null })

      const result = await loadObject(mockSupabase, videoObject)

      expect(createSignedUrlMock).toHaveBeenCalledTimes(2)
      expect(createSignedUrlMock).toHaveBeenCalledWith('test-video.mp4', 3600, {
        transform: undefined,
      })
      expect(createSignedUrlMock).toHaveBeenCalledWith('test-video.mp4.thumbnail.jpg', 3600, {
        transform: { width: 400 },
      })
      expect(result.stat?.url).toBe(signedUrl)
      expect(result.thumbnail?.url).toBe(thumbnailUrl)
      expect(result.error).toBeUndefined()
    })

    it('should handle missing storage object name', async () => {
      const invalidObject: NestedEntityToStorageObject = {
        id: 1,
        storageObjectId: 'test-1',
        areaFk: 1,
        ascentFk: 1,
        routeFk: 1,
        blockFk: 1,
        storageObject: {
          name: null,
          id: 'test-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          bucketId: 'files',
          lastAccessedAt: new Date('2024-01-01'),
          metadata: {
            cacheControl: '3600',
            contentLength: 1000,
            eTag: 'test-etag',
            httpStatusCode: 200,
            lastModified: '2024-01-01',
            mimetype: 'image/jpeg',
            size: 1000,
          },
          owner: 'test-user',
          pathTokens: ['test-image.jpg'],
          userMetadata: null,
          version: '1',
        },
      }

      const result = await loadObject(mockSupabase, invalidObject)

      expect(result.error).toBe('Storage object name is null')
      expect(createSignedUrlMock).not.toHaveBeenCalled()
    })

    it('should handle Supabase errors', async () => {
      createSignedUrlMock.mockResolvedValueOnce({ data: null, error: { message: 'Storage error' } })

      const result = await loadObject(mockSupabase, mockStorageObject)

      expect(result.error).toBe('Storage error')
      expect(result.stat).toBeUndefined()
    })
  })

  describe('loadObjects', () => {
    it('should load multiple objects', async () => {
      const objects = [mockStorageObject, mockStorageObject]
      const signedUrl = 'https://example.com/signed-url'
      createSignedUrlMock.mockResolvedValue({ data: { signedUrl }, error: null })

      const results = await loadObjects(mockSupabase, objects)

      expect(results).toHaveLength(2)
      expect(results[0].stat?.url).toBe(signedUrl)
      expect(results[1].stat?.url).toBe(signedUrl)
      expect(createSignedUrlMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('deleteObject', () => {
    it('should delete a single object and its thumbnail if they exist', async () => {
      existsMock
        .mockResolvedValueOnce({ data: true }) // File exists
        .mockResolvedValueOnce({ data: true }) // Thumbnail exists

      await deleteObject(mockStorageObject, mockSupabase)

      expect(existsMock).toHaveBeenCalledWith('test-image.jpg')
      expect(existsMock).toHaveBeenCalledWith('test-image.jpg.thumbnail.jpg')
      expect(removeMock).toHaveBeenCalledWith(['test-image.jpg', 'test-image.jpg.thumbnail.jpg'])
    })

    it('should handle multiple objects', async () => {
      const objects = [mockStorageObject, mockStorageObject]
      existsMock.mockResolvedValue({ data: true })

      await deleteObject(objects, mockSupabase)

      expect(existsMock).toHaveBeenCalledTimes(4) // 2 files * 2 checks (file + thumbnail)
      expect(removeMock).toHaveBeenCalledWith([
        'test-image.jpg',
        'test-image.jpg.thumbnail.jpg',
        'test-image.jpg',
        'test-image.jpg.thumbnail.jpg',
      ])
    })

    it('should skip non-existent files', async () => {
      existsMock
        .mockResolvedValueOnce({ data: false }) // File doesn't exist
        .mockResolvedValueOnce({ data: false }) // Thumbnail doesn't exist

      await deleteObject(mockStorageObject, mockSupabase)

      expect(existsMock).toHaveBeenCalledTimes(2)
      expect(removeMock).not.toHaveBeenCalled()
    })

    it('should handle missing storage object name', async () => {
      const invalidObject: NestedEntityToStorageObject = {
        id: 1,
        storageObjectId: 'test-1',
        areaFk: 1,
        ascentFk: 1,
        routeFk: 1,
        blockFk: 1,
        storageObject: {
          name: null,
          id: 'test-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          bucketId: 'files',
          lastAccessedAt: new Date('2024-01-01'),
          metadata: {
            cacheControl: '3600',
            contentLength: 1000,
            eTag: 'test-etag',
            httpStatusCode: 200,
            lastModified: '2024-01-01',
            mimetype: 'image/jpeg',
            size: 1000,
          },
          owner: 'test-user',
          pathTokens: ['test-image.jpg'],
          userMetadata: null,
          version: '1',
        },
      }

      await deleteObject(invalidObject, mockSupabase)

      expect(existsMock).not.toHaveBeenCalled()
      expect(removeMock).not.toHaveBeenCalled()
    })
  })
})
