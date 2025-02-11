import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { compress, transcode, getThumbnail, getMetadata } from './video'
import { uploadData } from './action'
import * as tus from 'tus-js-client'
import { config } from '$lib/config'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { handleFileUpload } from './handle.server'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '$lib/db/schema'
import { inArray } from 'drizzle-orm'
import type { Mock } from 'vitest'

// Mock FFmpeg and related utilities
const mockFFmpeg = {
  on: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  exec: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves to simulate long-running operation
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  terminate: vi.fn(),
  ffprobe: vi.fn().mockResolvedValue(undefined),
}

// Create a function to reset FFmpeg mock with default behavior
const resetFFmpegMock = () => {
  mockFFmpeg.exec.mockResolvedValue(undefined)
  mockFFmpeg.readFile.mockReset()
  mockFFmpeg.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
  mockFFmpeg.terminate.mockReset()
}

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: vi.fn().mockImplementation(() => mockFFmpeg),
}))

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  toBlobURL: vi.fn().mockResolvedValue('mock-blob-url'),
}))

// Mock tus-js-client
vi.mock('tus-js-client', () => ({
  Upload: vi.fn().mockImplementation((file, options) => ({
    findPreviousUploads: vi.fn().mockResolvedValue([]),
    start: vi.fn().mockImplementation(() => {
      // Simulate upload progress and success
      setTimeout(() => options.onProgress?.(file.size), 100)
      setTimeout(() => options.onSuccess?.(), 200)
    }),
    file,
    options,
    url: null,
    abort: vi.fn(),
    resumeFromPreviousUpload: vi.fn(),
  })),
}))

describe('Video Processing Functions', () => {
  let mockFile: File
  let mockSignal: AbortSignal
  let mockProgress: (progress: number) => void

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Create mock file
    mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' })

    // Create mock abort signal
    mockSignal = new AbortController().signal

    // Create mock progress callback
    mockProgress = vi.fn()

    // Reset exec mock for non-abort tests
    mockFFmpeg.exec.mockResolvedValue(undefined)
  })

  describe('transcode', () => {
    it('should successfully transcode a video', async () => {
      const result = await transcode(mockFile, mockSignal, mockProgress)

      expect(FFmpeg).toHaveBeenCalled()
      expect(result).toBeInstanceOf(Uint8Array)
      expect(mockProgress).toHaveBeenCalledWith(1)
    })

    it('should handle abort signal', async () => {
      // Make exec hang to simulate long-running operation
      mockFFmpeg.exec.mockImplementation(() => new Promise(() => {}))

      const controller = new AbortController()
      const signal = controller.signal

      // Start the transcode operation
      transcode(mockFile, signal, mockProgress)

      // Wait for FFmpeg to be initialized and exec to be called
      await vi.waitFor(() => {
        expect(FFmpeg).toHaveBeenCalled()
        expect(mockFFmpeg.exec).toHaveBeenCalled()
      })

      // Trigger abort
      controller.abort()

      // Don't await transcodePromise as it will never resolve
      expect(mockFFmpeg.terminate).toHaveBeenCalled()
    })
  })

  describe('compress', () => {
    it('should successfully compress a video', async () => {
      const result = await compress(mockFile, mockSignal, mockProgress)

      expect(FFmpeg).toHaveBeenCalled()
      expect(result).toBeInstanceOf(Uint8Array)
      expect(mockProgress).toHaveBeenCalledWith(1)
    })

    it('should handle abort signal', async () => {
      // Make exec hang to simulate long-running operation
      mockFFmpeg.exec.mockImplementation(() => new Promise(() => {}))

      const controller = new AbortController()
      const signal = controller.signal

      // Start the compress operation
      compress(mockFile, signal, mockProgress)

      // Wait for FFmpeg to be initialized and exec to be called
      await vi.waitFor(() => {
        expect(FFmpeg).toHaveBeenCalled()
        expect(mockFFmpeg.exec).toHaveBeenCalled()
      })

      // Trigger abort
      controller.abort()

      // Don't await compressPromise as it will never resolve
      expect(mockFFmpeg.terminate).toHaveBeenCalled()
    })
  })

  describe('getThumbnail', () => {
    it('should successfully generate a thumbnail', async () => {
      const result = await getThumbnail(mockFile)

      expect(FFmpeg).toHaveBeenCalled()
      expect(result).toBeInstanceOf(Uint8Array)
    })

    it('should throw error if output is not Uint8Array', async () => {
      mockFFmpeg.readFile.mockResolvedValueOnce('invalid-output')

      await expect(getThumbnail(mockFile)).rejects.toThrow('Invalid type')
    })
  })

  describe('getMetadata', () => {
    it('should successfully extract video metadata', async () => {
      const mockMetadataOutput = `h264\n1080\n1920\n5000000`
      mockFFmpeg.readFile.mockResolvedValueOnce(mockMetadataOutput)

      const result = await getMetadata(mockFile)

      expect(FFmpeg).toHaveBeenCalled()
      expect(result).toEqual({
        codec: 'h264',
        height: 1080,
        width: 1920,
        bitrate: 5000000,
        filesize: mockFile.size,
      })
    })

    it('should handle metadata extraction with TextDecoder for Uint8Array output', async () => {
      const mockMetadataOutput = new Uint8Array(Buffer.from(`h264\n1080\n1920\n5000000`))
      mockFFmpeg.readFile.mockResolvedValueOnce(mockMetadataOutput)

      const result = await getMetadata(mockFile)

      expect(result).toEqual({
        codec: 'h264',
        height: 1080,
        width: 1920,
        bitrate: 5000000,
        filesize: mockFile.size,
      })
    })
  })
})

describe('File Upload Functions', () => {
  let mockFormData: FormData
  let mockPageData: {
    session: Session
    user: {
      id: number
      username: string
      authUserFk: string
      firstAscensionistFk: number | null
      userSettingsFk: number | null
      createdAt: string
    }
    supabase: SupabaseClient
  }
  let mockSignal: AbortSignal
  let mockProgress: (progress: { percentage: number; step: string }) => void
  let mockVideoFile: File
  let mockImageFile: File

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create mock files
    mockVideoFile = new File(['test-video'], 'test.mp4', { type: 'video/mp4' })
    mockImageFile = new File(['test-image'], 'test.jpg', { type: 'image/jpeg' })

    // Create mock FormData
    mockFormData = new FormData()
    mockFormData.append('files', mockVideoFile)
    mockFormData.append('files', mockImageFile)
    mockFormData.append('folderName', 'test-folder')

    // Create mock page data
    mockPageData = {
      session: {
        access_token: 'test-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'test-user-id', email: 'test@example.com' },
      } as Session,
      user: {
        id: 1,
        username: 'testuser',
        authUserFk: 'test-user-id',
        firstAscensionistFk: null,
        userSettingsFk: null,
        createdAt: new Date().toISOString(),
      },
      supabase: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        storage: {
          from: () => ({
            upload: vi.fn().mockResolvedValue({ error: null }),
          }),
        },
      } as unknown as SupabaseClient,
    }

    // Create mock abort signal
    mockSignal = new AbortController().signal

    // Create mock progress callback
    mockProgress = vi.fn()

    // Reset FFmpeg mocks with default behavior
    resetFFmpegMock()
  })

  describe('uploadData', () => {
    it('should process and upload files successfully', async () => {
      // Set up FFmpeg mock responses for the video file
      mockFFmpeg.readFile
        .mockResolvedValueOnce(Buffer.from(`h264\n720\n1280\n2000000`)) // For metadata
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3])) // For thumbnail
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6])) // For any potential processing output

      await uploadData(mockFormData, mockPageData, mockSignal, mockProgress)

      // Verify progress updates
      expect(mockProgress).toHaveBeenCalledWith({ percentage: 0, step: 'initializing' })
      expect(mockProgress).toHaveBeenCalledWith({ percentage: expect.any(Number), step: 'uploading' })
      expect(mockProgress).toHaveBeenCalledWith({ percentage: 100, step: 'done' })
    })

    it('should handle video compression when needed', async () => {
      // Mock video metadata to trigger compression and thumbnail generation
      mockFFmpeg.readFile
        .mockResolvedValueOnce(Buffer.from(`h264\n1440\n2560\n6000000`)) // For metadata (triggers compression)
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3])) // For thumbnail
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6])) // For compressed output

      await uploadData(mockFormData, mockPageData, mockSignal, mockProgress)

      // Verify compression was triggered
      expect(mockFFmpeg.exec).toHaveBeenCalled()
      expect(mockProgress).toHaveBeenCalledWith({ percentage: expect.any(Number), step: 'compressing' })
    })

    it('should handle video transcoding when needed', async () => {
      // Mock video metadata to trigger transcoding and thumbnail generation
      mockFFmpeg.readFile
        .mockResolvedValueOnce(Buffer.from(`vp9\n720\n1280\n2000000`)) // For metadata (triggers transcoding)
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3])) // For thumbnail
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6])) // For transcoded output

      await uploadData(mockFormData, mockPageData, mockSignal, mockProgress)

      // Verify transcoding was triggered
      expect(mockFFmpeg.exec).toHaveBeenCalled()
      expect(mockProgress).toHaveBeenCalledWith({ percentage: expect.any(Number), step: 'compressing' })
    })

    it('should generate thumbnails for videos', async () => {
      // Mock video metadata and thumbnail generation
      mockFFmpeg.readFile
        .mockResolvedValueOnce(Buffer.from(`h264\n720\n1280\n2000000`)) // For metadata
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3])) // For thumbnail
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6])) // For any potential processing output

      await uploadData(mockFormData, mockPageData, mockSignal, mockProgress)

      // Verify thumbnail generation
      expect(mockFFmpeg.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['-vf', "select='eq(n,0)'", '-vframes', '1', 'thumbnail.jpg']),
      )
    })

    it('should handle empty file list', async () => {
      const emptyFormData = new FormData()
      await uploadData(emptyFormData, mockPageData, mockSignal, mockProgress)

      // Verify no processing or upload occurred
      expect(mockFFmpeg.exec).not.toHaveBeenCalled()
      expect(tus.Upload).not.toHaveBeenCalled()
    })

    it('should throw error when file size exceeds maximum', async () => {
      const maxSize = config.files.maxSize.number
      const largeFile = new File(['x'.repeat(maxSize + 1)], 'large.mp4', { type: 'video/mp4' })
      const formData = new FormData()
      formData.append('files', largeFile)
      formData.append('folderName', 'test-folder')

      // Mock metadata to trigger processing
      mockFFmpeg.readFile
        .mockResolvedValueOnce(Buffer.from(`h264\n720\n1280\n2000000`)) // For metadata
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3])) // For thumbnail
        .mockResolvedValueOnce(new Uint8Array(Buffer.alloc(maxSize + 1))) // For processed file (still too large)

      await expect(uploadData(formData, mockPageData, mockSignal, mockProgress)).rejects.toThrow(
        `File size exceeds the maximum allowed size (${config.files.maxSize.human})`,
      )
    })

    it('should fallback to Supabase upload when tus upload fails', async () => {
      // Mock video metadata and thumbnail generation
      mockFFmpeg.readFile
        .mockResolvedValueOnce(Buffer.from(`h264\n720\n1280\n2000000`)) // For metadata
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3])) // For thumbnail
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6])) // For any potential processing output

      // Create a mock upload function for Supabase
      const mockUpload = vi.fn().mockResolvedValue({ error: null })
      const mockStorageApi = {
        upload: mockUpload,
        // Add minimal mock implementations for required methods
        remove: vi.fn(),
        list: vi.fn(),
        download: vi.fn(),
        getPublicUrl: vi.fn(),
        createSignedUrl: vi.fn(),
      }

      // Override the storage.from method with our mock
      mockPageData.supabase = {
        ...mockPageData.supabase,
        storage: {
          from: () => mockStorageApi,
        },
      } as unknown as SupabaseClient

      // Mock tus upload to fail immediately
      vi.mocked(tus.Upload).mockImplementationOnce((file, options) => ({
        findPreviousUploads: vi.fn().mockResolvedValue([]),
        start: vi.fn().mockImplementation(() => {
          options.onError?.(new Error('Tus upload failed'))
        }),
        file,
        options,
        url: null,
        abort: vi.fn(),
        resumeFromPreviousUpload: vi.fn(),
      }))

      await uploadData(mockFormData, mockPageData, mockSignal, mockProgress)

      // Verify Supabase upload was called
      expect(mockUpload).toHaveBeenCalled()
    })
  })
})

describe('File Upload Handler', () => {
  let mockDb: {
    query: {
      storageObjects: {
        findMany: Mock
      }
    }
    insert: Mock
    values: Mock
    returning: Mock
  }

  beforeEach(() => {
    // Create a simple mock that implements just what we need
    const findMany = vi.fn() as Mock
    const insert = vi.fn().mockReturnThis() as Mock
    const values = vi.fn().mockReturnThis() as Mock
    const returning = vi.fn() as Mock

    mockDb = {
      query: {
        storageObjects: {
          findMany,
        },
      },
      insert,
      values,
      returning,
    }
  })

  it('should handle file upload with regular files', async () => {
    // Mock database responses with full storage object structure
    const mockStorageObjects = [
      {
        id: '1',
        name: 'file1.mp4',
        createdAt: new Date(),
        updatedAt: new Date(),
        bucketId: 'files',
        lastAccessedAt: new Date(),
        metadata: null,
        owner: null,
        pathTokens: [],
        userMetadata: null,
        version: '1',
      },
      {
        id: '2',
        name: 'file2.jpg',
        createdAt: new Date(),
        updatedAt: new Date(),
        bucketId: 'files',
        lastAccessedAt: new Date(),
        metadata: null,
        owner: null,
        pathTokens: [],
        userMetadata: null,
        version: '1',
      },
    ]
    const mockInsertedRecords = [
      { id: 1, storageObjectId: '1', routeFk: 123 },
      { id: 2, storageObjectId: '2', routeFk: 123 },
    ]

    mockDb.query.storageObjects.findMany.mockResolvedValue(mockStorageObjects)
    mockDb.returning.mockResolvedValue(mockInsertedRecords)

    const filenames = ['file1.mp4', 'file2.jpg']
    const init = { routeFk: 123 }

    const result = await handleFileUpload(mockDb as unknown as PostgresJsDatabase<typeof schema>, filenames, init)

    // Verify database queries
    expect(mockDb.query.storageObjects.findMany).toHaveBeenCalledWith({
      where: expect.any(Object),
    })
    expect(mockDb.insert).toHaveBeenCalled()
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ routeFk: 123, storageObjectId: '1' }),
        expect.objectContaining({ routeFk: 123, storageObjectId: '2' }),
      ]),
    )
    expect(result).toEqual(mockInsertedRecords)
  })

  it('should filter out thumbnail files', async () => {
    // Mock database responses with full storage object structure
    const mockStorageObjects = [
      {
        id: '1',
        name: 'file1.mp4',
        createdAt: new Date(),
        updatedAt: new Date(),
        bucketId: 'files',
        lastAccessedAt: new Date(),
        metadata: null,
        owner: null,
        pathTokens: [],
        userMetadata: null,
        version: '1',
      },
    ]
    const mockInsertedRecords = [{ id: 1, storageObjectId: '1', routeFk: 123 }]

    mockDb.query.storageObjects.findMany.mockResolvedValue(mockStorageObjects)
    mockDb.returning.mockResolvedValue(mockInsertedRecords)

    const filenames = ['file1.mp4', 'file1.mp4.thumbnail.jpg']
    const init = { routeFk: 123 }

    await handleFileUpload(mockDb as unknown as PostgresJsDatabase<typeof schema>, filenames, init)

    // Verify only non-thumbnail files were queried
    expect(mockDb.query.storageObjects.findMany).toHaveBeenCalledWith({
      where: inArray(schema.storageObjects.name, ['file1.mp4']),
    })
  })

  it('should handle empty file list', async () => {
    mockDb.query.storageObjects.findMany.mockResolvedValue([])
    mockDb.returning.mockResolvedValue([])

    const result = await handleFileUpload(mockDb as unknown as PostgresJsDatabase<typeof schema>, [], { routeFk: 123 })

    expect(result).toEqual([])
    expect(mockDb.query.storageObjects.findMany).toHaveBeenCalledWith({
      where: expect.any(Object),
    })
  })

  it('should handle missing storage objects', async () => {
    // Mock scenario where files exist but storage objects are not found
    mockDb.query.storageObjects.findMany.mockResolvedValue([])
    mockDb.returning.mockResolvedValue([])

    const filenames = ['nonexistent1.mp4', 'nonexistent2.jpg']
    const result = await handleFileUpload(mockDb as unknown as PostgresJsDatabase<typeof schema>, filenames, {
      routeFk: 123,
    })

    expect(result).toEqual([])
    expect(mockDb.values).toHaveBeenCalledWith([]) // No values should be inserted
  })

  it('should handle partial init data', async () => {
    const mockStorageObjects = [
      {
        id: '1',
        name: 'file1.mp4',
        createdAt: new Date(),
        updatedAt: new Date(),
        bucketId: 'files',
        lastAccessedAt: new Date(),
        metadata: null,
        owner: null,
        pathTokens: [],
        userMetadata: null,
        version: '1',
      },
    ]
    const mockInsertedRecords = [{ id: 1, storageObjectId: '1' }]

    mockDb.query.storageObjects.findMany.mockResolvedValue(mockStorageObjects)
    mockDb.returning.mockResolvedValue(mockInsertedRecords)

    // Call without init data but with empty object to satisfy required argument
    await handleFileUpload(mockDb as unknown as PostgresJsDatabase<typeof schema>, ['file1.mp4'], {})

    expect(mockDb.values).toHaveBeenCalledWith([expect.objectContaining({ storageObjectId: '1' })])
  })

  it('should preserve init data for all records', async () => {
    const mockStorageObjects = [
      {
        id: '1',
        name: 'file1.mp4',
        createdAt: new Date(),
        updatedAt: new Date(),
        bucketId: 'files',
        lastAccessedAt: new Date(),
        metadata: null,
        owner: null,
        pathTokens: [],
        userMetadata: null,
        version: '1',
      },
      {
        id: '2',
        name: 'file2.jpg',
        createdAt: new Date(),
        updatedAt: new Date(),
        bucketId: 'files',
        lastAccessedAt: new Date(),
        metadata: null,
        owner: null,
        pathTokens: [],
        userMetadata: null,
        version: '1',
      },
    ]
    const mockInsertedRecords = [
      { id: 1, storageObjectId: '1', routeFk: 123 },
      { id: 2, storageObjectId: '2', routeFk: 123 },
    ]

    mockDb.query.storageObjects.findMany.mockResolvedValue(mockStorageObjects)
    mockDb.returning.mockResolvedValue(mockInsertedRecords)

    const init = { routeFk: 123 }
    await handleFileUpload(mockDb as unknown as PostgresJsDatabase<typeof schema>, ['file1.mp4', 'file2.jpg'], init)

    expect(mockDb.values).toHaveBeenCalledWith([
      expect.objectContaining({ storageObjectId: '1', routeFk: 123 }),
      expect.objectContaining({ storageObjectId: '2', routeFk: 123 }),
    ])
  })
})
