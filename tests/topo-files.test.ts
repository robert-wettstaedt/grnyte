import type { Block, InsertGeolocation } from '$lib/db/schema'
import * as schema from '$lib/db/schema'
import { blocks, geolocations } from '$lib/db/schema'
import { createGeolocationFromFiles, createOrUpdateGeolocation } from '$lib/topo-files.server'
import { SupabaseClient } from '@supabase/supabase-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import exif from 'exifr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// Create test data for the Blob
const testData = new Uint8Array([0, 1, 2, 3, 4, 5])

// Mock Supabase client
const mockSupabase = {
  storage: {
    from: () => ({
      download: vi.fn().mockResolvedValue({
        data: {
          arrayBuffer: () => Promise.resolve(testData.buffer),
        },
      }),
    }),
  },
} as unknown as SupabaseClient

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
    storageObjects: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, name: 'test-image-1.jpg' },
        { id: 2, name: 'test-image-2.jpg' },
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
      const files = [
        { id: 1, storageObjectId: '1', areaFk: null, routeFk: null, blockFk: 1, ascentFk: null },
        { id: 2, storageObjectId: '2', areaFk: null, routeFk: null, blockFk: 1, ascentFk: null },
      ] as schema.EntityToStorageObject[]

      await createGeolocationFromFiles(mockDb, mockSupabase, mockBlock, files)

      expect(exif.gps).toHaveBeenCalledTimes(2)
      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('should handle files without GPS data', async () => {
      // Mock exif.gps to return undefined for all files
      // @ts-expect-error - We want to test the null case
      vi.mocked(exif.gps).mockResolvedValue(undefined)
      const files = [
        { id: 1, storageObjectId: '1', areaFk: null, routeFk: null, blockFk: 1, ascentFk: null },
        { id: 2, storageObjectId: '2', areaFk: null, routeFk: null, blockFk: 1, ascentFk: null },
      ] as schema.EntityToStorageObject[]

      await createGeolocationFromFiles(mockDb, mockSupabase, mockBlock, files)

      expect(mockDb.insert).not.toHaveBeenCalled()
    })

    it('should pass operation parameter to createOrUpdateGeolocation', async () => {
      const blockWithGeo = { ...mockBlock, geolocationFk: 1 }
      const files = [
        { id: 1, storageObjectId: '1', areaFk: null, routeFk: null, blockFk: 1, ascentFk: null },
      ] as schema.EntityToStorageObject[]
      vi.mocked(exif.gps).mockResolvedValueOnce({ latitude: 47.123, longitude: 8.456 })

      await createGeolocationFromFiles(mockDb, mockSupabase, blockWithGeo, files, 'update')

      expect(mockDb.update).toHaveBeenCalledWith(geolocations)
      expect(mockDb.insert).not.toHaveBeenCalled()
    })
  })
})
