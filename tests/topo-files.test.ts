import type { Block, InsertGeolocation } from '$lib/db/schema'
import * as schema from '$lib/db/schema'
import { blocks, geolocations } from '$lib/db/schema'
import { createGeolocationFromFiles, createOrUpdateGeolocation } from '$lib/topo-files.server'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import exif from 'exifr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock modules
vi.mock('$env/static/private', () => ({
  NEXTCLOUD_USER_NAME: 'test-user',
}))

vi.mock('$lib/nextcloud/nextcloud.server', () => {
  const exists = vi.fn().mockResolvedValue(true)
  const createDirectory = vi.fn().mockResolvedValue(undefined)
  const putFileContents = vi.fn().mockResolvedValue(true)
  const moveFile = vi.fn().mockResolvedValue(undefined)
  const mkDir = vi.fn((path: string) => path)

  return {
    getNextcloud: vi.fn(() => ({
      exists,
      createDirectory,
      putFileContents,
      moveFile,
    })),
    mkDir,
  }
})

vi.mock('$lib/cache.server', () => ({
  invalidateCache: vi.fn(),
}))

vi.mock('sharp', () => ({
  default: vi.fn(),
}))

vi.mock('exifr', () => ({
  default: {
    gps: vi.fn().mockResolvedValue({ latitude: 47.123, longitude: 8.456 }),
  },
}))

// Mock data
const mockBlock = {
  id: 1,
  name: 'Test Block',
  slug: 'test-block',
  areaFk: 1,
  createdAt: new Date().toISOString(),
  createdBy: 1,
  geolocationFk: null,
} as Block

// Mock database with minimal implementation needed for tests
const mockDb = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1, blockFk: 1, path: '', type: 'topo' }]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ id: 1 }]),
    }),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
  query: {
    files: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, path: '/topos/old-area/sector/block.1.jpg' },
        { id: 2, path: '/topos/old-area/sector/block.2.jpg' },
      ]),
    },
  },
} as unknown as PostgresJsDatabase<typeof schema>

describe('Topo Files', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createOrUpdateGeolocation', () => {
    const geolocation: InsertGeolocation = { lat: 47.123, long: 8.456 }
    const blockWithGeo = { ...mockBlock, geolocationFk: 1 }

    describe('with operation="all" (default)', () => {
      it('should create new geolocation when block has none', async () => {
        await createOrUpdateGeolocation(mockDb, mockBlock, geolocation)

        expect(mockDb.insert).toHaveBeenCalledWith(geolocations)
        expect(mockDb.update).toHaveBeenCalledWith(blocks)
      })

      it('should update existing geolocation', async () => {
        await createOrUpdateGeolocation(mockDb, blockWithGeo, geolocation)

        expect(mockDb.update).toHaveBeenCalledWith(geolocations)
      })
    })

    describe('with operation="create"', () => {
      it('should create new geolocation when block has none', async () => {
        await createOrUpdateGeolocation(mockDb, mockBlock, geolocation, 'create')

        expect(mockDb.insert).toHaveBeenCalledWith(geolocations)
        expect(mockDb.update).toHaveBeenCalledWith(blocks)
      })

      it('should not update existing geolocation', async () => {
        await createOrUpdateGeolocation(mockDb, blockWithGeo, geolocation, 'create')

        expect(mockDb.update).not.toHaveBeenCalledWith(geolocations)
      })
    })

    describe('with operation="update"', () => {
      it('should not create new geolocation when block has none', async () => {
        await createOrUpdateGeolocation(mockDb, mockBlock, geolocation, 'update')

        expect(mockDb.insert).not.toHaveBeenCalled()
        expect(mockDb.update).not.toHaveBeenCalledWith(blocks)
      })

      it('should update existing geolocation', async () => {
        await createOrUpdateGeolocation(mockDb, blockWithGeo, geolocation, 'update')

        expect(mockDb.update).toHaveBeenCalledWith(geolocations)
      })
    })
  })

  describe('createGeolocationFromFiles', () => {
    it('should extract GPS data and create geolocation', async () => {
      const buffers = [Buffer.from('test-image-1').buffer, Buffer.from('test-image-2').buffer]
      await createGeolocationFromFiles(mockDb, mockBlock, buffers)

      expect(exif.gps).toHaveBeenCalledTimes(2)
      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('should handle files without GPS data', async () => {
      // @ts-expect-error - We want to test the null case
      vi.mocked(exif.gps).mockResolvedValueOnce(undefined)
      const buffers = [Buffer.from('test-image').buffer]
      await createGeolocationFromFiles(mockDb, mockBlock, buffers)

      expect(mockDb.insert).not.toHaveBeenCalled()
    })

    it('should pass operation parameter to createOrUpdateGeolocation', async () => {
      const blockWithGeo = { ...mockBlock, geolocationFk: 1 }
      const buffers = [Buffer.from('test-image').buffer]
      vi.mocked(exif.gps).mockResolvedValueOnce({ latitude: 47.123, longitude: 8.456 })

      await createGeolocationFromFiles(mockDb, blockWithGeo, buffers, 'update')

      expect(mockDb.update).toHaveBeenCalledWith(geolocations)
      expect(mockDb.insert).not.toHaveBeenCalled()
    })
  })
})
