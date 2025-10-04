import { NEXTCLOUD_USER_NAME } from '$env/static/private'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { getNextcloud, mkDir } from '$lib/nextcloud/nextcloud.server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import convert from 'heic-convert'
import sharp from 'sharp'

interface FileUploadResult {
  file: schema.File
  fileBuffer?: ArrayBuffer
}

/**
 * Analyzes image characteristics to determine optimal compression quality
 * Higher quality for complex/detailed photos, lower for simple photos
 */
const analyzeImageForOptimalQuality = async (image: sharp.Sharp): Promise<number> => {
  const [stats, metadata] = await Promise.all([image.stats(), image.metadata()])

  // Calculate image complexity based on standard deviation across channels
  const complexity = stats.channels.reduce((sum, channel) => sum + channel.stdev, 0) / stats.channels.length

  // Base quality based on complexity (more complex = higher quality needed)
  let baseQuality = 75
  if (complexity > 60)
    baseQuality = 88 // High detail photos
  else if (complexity > 40)
    baseQuality = 82 // Medium detail photos
  else baseQuality = 76 // Lower detail photos

  // Adjust based on image size - larger images can use slightly lower quality
  const pixelCount = (metadata.width || 0) * (metadata.height || 0)
  let sizeAdjustment = 0
  if (pixelCount > 2000000)
    sizeAdjustment = -3 // Very large images
  else if (pixelCount > 1000000) sizeAdjustment = -2 // Large images

  return Math.max(70, Math.min(92, baseQuality + sizeAdjustment))
}

/**
 * Optimizes photo compression using advanced Sharp settings
 * Focuses on photographic content with perceptual quality optimization
 */
const optimizePhotoCompression = async (
  inputBuffer: ArrayBuffer,
  resizeOpts: sharp.ResizeOptions,
): Promise<{ webp: Buffer; jpeg: Buffer }> => {
  const image = sharp(inputBuffer)
  const quality = await analyzeImageForOptimalQuality(image)

  // Create resized base image
  const resizedImage = image.resize(resizeOpts).keepMetadata()

  // Generate both WebP and JPEG versions in parallel
  const [webpBuffer, jpegBuffer] = await Promise.all([
    // WebP - excellent compression for photos with good browser support
    resizedImage
      .clone()
      .webp({
        quality: quality,
        effort: 6, // High effort for better compression
        smartSubsample: true, // Better quality at low bitrates
        nearLossless: false, // Use lossy compression for better size
      })
      .toBuffer(),

    // JPEG with mozjpeg for fallback compatibility
    resizedImage
      .clone()
      .jpeg({
        quality: quality,
        progressive: true, // Progressive loading
        mozjpeg: true, // Use mozjpeg encoder (better compression than libjpeg)
        optimiseScans: true, // Optimize huffman tables
        optimiseCoding: true, // Optimize coding
        quantisationTable: 3, // Use psychovisual quantization table
      })
      .toBuffer(),
  ])

  return { webp: webpBuffer, jpeg: jpegBuffer }
}

/**
 * Compresses photo to target file size using adaptive resolution and quality
 * First tries to find optimal resolution, then adjusts quality
 */
const compressToTargetSize = async (
  inputBuffer: ArrayBuffer,
  targetSizeKB: number = 100,
  tolerance: number = 0.05, // 5% tolerance
  minQuality: number = 65, // Minimum acceptable quality
): Promise<{
  buffer: Buffer
  format: 'webp' | 'jpeg'
  finalQuality: number
  finalSize: number
  finalResolution: number
}> => {
  const image = sharp(inputBuffer)
  const metadata = await image.metadata()
  const targetBytes = targetSizeKB * 1024

  const originalWidth = metadata.width || 1024
  const originalHeight = metadata.height || 1024
  const isLandscape = originalWidth > originalHeight

  // Try different resolutions from largest to smallest
  const resolutionTargets = [1024, 800, 640, 512, 400, 320]

  for (const targetResolution of resolutionTargets) {
    // Skip if this resolution is larger than original
    const maxOriginalDimension = Math.max(originalWidth, originalHeight)
    if (targetResolution > maxOriginalDimension) continue

    const resizeOpts: sharp.ResizeOptions = isLandscape ? { width: targetResolution } : { height: targetResolution }

    const resizedImage = image.resize(resizeOpts).keepMetadata()

    // Try WebP first (usually more efficient)
    const webpResult = await findOptimalQualityWithMinimum(
      resizedImage.clone(),
      'webp',
      targetBytes,
      tolerance,
      minQuality,
    )

    // If WebP achieves target with acceptable quality, use it
    if (webpResult.finalQuality >= minQuality && webpResult.finalSize <= targetBytes * (1 + tolerance)) {
      return {
        ...webpResult,
        format: 'webp',
        finalResolution: targetResolution,
      }
    }

    // Try JPEG as fallback
    const jpegResult = await findOptimalQualityWithMinimum(
      resizedImage.clone(),
      'jpeg',
      targetBytes,
      tolerance,
      minQuality,
    )

    // If JPEG achieves target with acceptable quality, use it
    if (jpegResult.finalQuality >= minQuality && jpegResult.finalSize <= targetBytes * (1 + tolerance)) {
      return {
        ...jpegResult,
        format: 'jpeg',
        finalResolution: targetResolution,
      }
    }
  }

  // If we can't achieve target size with acceptable quality, use smallest resolution with best quality possible
  const fallbackResolution = 320
  const resizeOpts: sharp.ResizeOptions = isLandscape ? { width: fallbackResolution } : { height: fallbackResolution }

  const resizedImage = image.resize(resizeOpts).keepMetadata()

  // Use 80% quality as fallback - better to have good quality at small size
  const fallbackQuality = 80

  const [webpBuffer, jpegBuffer] = await Promise.all([
    resizedImage
      .clone()
      .webp({
        quality: fallbackQuality,
        effort: 6,
        smartSubsample: true,
        nearLossless: false,
      })
      .toBuffer(),

    resizedImage
      .clone()
      .jpeg({
        quality: fallbackQuality,
        progressive: true,
        mozjpeg: true,
        optimiseScans: true,
        optimiseCoding: true,
        quantisationTable: 3,
      })
      .toBuffer(),
  ])

  // Return the smaller format
  if (webpBuffer.length <= jpegBuffer.length) {
    return {
      buffer: webpBuffer,
      format: 'webp',
      finalQuality: fallbackQuality,
      finalSize: webpBuffer.length,
      finalResolution: fallbackResolution,
    }
  } else {
    return {
      buffer: jpegBuffer,
      format: 'jpeg',
      finalQuality: fallbackQuality,
      finalSize: jpegBuffer.length,
      finalResolution: fallbackResolution,
    }
  }
}

/**
 * Binary search to find optimal quality for target file size with minimum quality constraint
 */
const findOptimalQualityWithMinimum = async (
  image: sharp.Sharp,
  format: 'webp' | 'jpeg',
  targetBytes: number,
  tolerance: number,
  minQuality: number = 65,
): Promise<{ buffer: Buffer; finalQuality: number; finalSize: number }> => {
  let minSearchQuality = Math.max(minQuality, 20)
  let maxSearchQuality = 95
  let bestResult: { buffer: Buffer; finalQuality: number; finalSize: number } = {
    buffer: Buffer.alloc(0),
    finalQuality: minSearchQuality,
    finalSize: 0,
  }

  // Maximum 8 iterations to prevent infinite loops
  for (let iteration = 0; iteration < 8; iteration++) {
    const currentQuality = Math.round((minSearchQuality + maxSearchQuality) / 2)

    let buffer: Buffer
    if (format === 'webp') {
      buffer = await image
        .clone()
        .webp({
          quality: currentQuality,
          effort: 6,
          smartSubsample: true,
          nearLossless: false,
        })
        .toBuffer()
    } else {
      buffer = await image
        .clone()
        .jpeg({
          quality: currentQuality,
          progressive: true,
          mozjpeg: true,
          optimiseScans: true,
          optimiseCoding: true,
          quantisationTable: 3,
        })
        .toBuffer()
    }

    const currentSize = buffer.length
    bestResult = { buffer, finalQuality: currentQuality, finalSize: currentSize }

    // Check if we're within tolerance
    if (currentSize <= targetBytes * (1 + tolerance) && currentSize >= targetBytes * (1 - tolerance)) {
      break
    }

    // Adjust search range
    if (currentSize > targetBytes) {
      maxSearchQuality = currentQuality - 1
    } else {
      minSearchQuality = currentQuality + 1
    }

    // Prevent infinite search
    if (minSearchQuality >= maxSearchQuality) {
      break
    }
  }

  return bestResult
}

export const handleFileUpload = async (
  db: PostgresJsDatabase<typeof schema>,
  supabase: SupabaseClient,
  srcFolder: string,
  dstFolder: string,
  fileInit: Partial<schema.InsertFile> & Required<Pick<schema.InsertFile, 'regionFk'>>,
  bunnyVideoIds?: string[] | null,
): Promise<FileUploadResult[]> => {
  const files: FileUploadResult[] = []

  if (bunnyVideoIds != null) {
    files.push(...(await handleBunnyVideoUpload(db, bunnyVideoIds, fileInit)))
  } else {
    files.push(...(await handleSupabaseFileUpload(db, supabase, srcFolder, dstFolder, fileInit)))
  }

  return files
}

export const handleSupabaseFileUpload = async (
  db: PostgresJsDatabase<typeof schema>,
  supabase: SupabaseClient,
  srcFolder: string,
  dstFolder: string,
  fileInit: Partial<schema.InsertFile> & Required<Pick<schema.InsertFile, 'regionFk'>>,
): Promise<FileUploadResult[]> => {
  const nextcloud = getNextcloud()

  const listResult = await supabase.storage.from('uploads').list(srcFolder)
  if (listResult.error != null) {
    throw listResult.error
  }

  await mkDir(dstFolder)

  const createdFiles = await Promise.all(
    listResult.data.map(async (supabaseFile) => {
      const [dbFile] = await db
        .insert(schema.files)
        .values({ ...fileInit, path: `${dstFolder}/${supabaseFile.name}` })
        .returning()

      const ext =
        typeof supabaseFile.metadata.mimetype === 'string' && supabaseFile.metadata.mimetype.startsWith('image/')
          ? 'jpg' // Default to jpg, may be changed to webp during optimization
          : supabaseFile.name.split('.').at(-1)

      const fileName = `${dbFile.id}.${ext}`
      const origFileName = `${dbFile.id}.orig.${ext}`
      const path = `${dstFolder}/${fileName}`
      const origPath = `${dstFolder}/${origFileName}`

      await db.update(schema.files).set({ path }).where(eq(schema.files.id, dbFile.id))

      return { ...dbFile, path, origPath }
    }),
  )

  try {
    return await Promise.all(
      listResult.data.map(async (supabaseFile, index) => {
        const createdFile = createdFiles[index]

        const downloadResult = await supabase.storage.from('uploads').download(`${srcFolder}/${supabaseFile.name}`)
        if (downloadResult.error != null) {
          throw downloadResult.error
        }

        let fileBuffer = await downloadResult.data.arrayBuffer()

        if (supabaseFile.metadata.mimetype === 'image/heic') {
          // https://github.com/catdad-experiments/heic-convert/issues/34
          const buffer = new Uint8Array(fileBuffer) as unknown as ArrayBufferLike
          fileBuffer = await convert({ buffer, format: 'JPEG', quality: 1 })
        }

        if (typeof supabaseFile.metadata.mimetype === 'string' && supabaseFile.metadata.mimetype.startsWith('image/')) {
          const image = sharp(fileBuffer)
          const metadata = await image.metadata()

          const resizeOpts: sharp.ResizeOptions =
            (metadata.width ?? 0) > (metadata.height ?? 0) ? { height: 1024 } : { width: 1024 }

          // Compress to target size of 100KB with 5% tolerance and minimum 65% quality
          const {
            buffer: optimizedBuffer,
            format,
            finalQuality,
            finalSize,
            finalResolution,
          } = await compressToTargetSize(
            fileBuffer,
            100, // Target 100KB
            0.05, // 5% tolerance
            65, // Minimum acceptable quality
          )

          console.log(
            `Compressed ${supabaseFile.name}: ${format} at ${finalQuality}% quality, ${Math.round(finalSize / 1024)}KB, ${finalResolution}px`,
          )

          // Update file extension in database based on chosen format
          const optimizedExt = format === 'webp' ? 'webp' : 'jpg'
          if (optimizedExt !== createdFile.path.split('.').pop()) {
            const newPath = createdFile.path.replace(/\.[^.]+$/, `.${optimizedExt}`)
            await db.update(schema.files).set({ path: newPath }).where(eq(schema.files.id, createdFile.id))
            createdFile.path = newPath
          }

          await Promise.all([
            nextcloud.putFileContents(NEXTCLOUD_USER_NAME + createdFile.origPath, fileBuffer),
            nextcloud.putFileContents(NEXTCLOUD_USER_NAME + createdFile.path, optimizedBuffer),
          ])
        } else {
          await nextcloud.putFileContents(NEXTCLOUD_USER_NAME + createdFile.path, fileBuffer)
        }

        return { fileBuffer, file: createdFile }
      }),
    )
  } catch (exception) {
    await Promise.all(
      createdFiles.map(async (file) => {
        try {
          await db.delete(schema.files).where(eq(schema.files.id, file.id))

          if (await nextcloud.exists(NEXTCLOUD_USER_NAME + file.path)) {
            await nextcloud.deleteFile(NEXTCLOUD_USER_NAME + file.path)
          }

          if (await nextcloud.exists(NEXTCLOUD_USER_NAME + file.origPath)) {
            await nextcloud.deleteFile(NEXTCLOUD_USER_NAME + file.origPath)
          }
        } catch (exception) {
          console.error(convertException(exception))
        }
      }),
    )

    throw exception
  } finally {
    await supabase.storage.from('uploads').remove(listResult.data.map((file) => `${srcFolder}/${file.name}`))
  }
}

export const handleBunnyVideoUpload = async (
  db: PostgresJsDatabase<typeof schema>,
  bunnyVideoIds: string[],
  fileInit: Partial<schema.InsertFile> & Required<Pick<schema.InsertFile, 'regionFk'>>,
): Promise<FileUploadResult[]> => {
  return Promise.all(
    bunnyVideoIds.map(async (bunnyVideoId) => {
      const [dbFile] = await db
        .insert(schema.files)
        .values({ ...fileInit, path: '' })
        .returning()

      await db.insert(schema.bunnyStreams).values({ id: bunnyVideoId, fileFk: dbFile.id, regionFk: dbFile.regionFk })
      await db.update(schema.files).set({ bunnyStreamFk: bunnyVideoId }).where(eq(schema.files.id, dbFile.id))

      return { file: dbFile }
    }),
  )
}
