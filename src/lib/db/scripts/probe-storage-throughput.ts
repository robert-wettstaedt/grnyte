/**
 * Read-only probe: how fast this machine pulls images out of Nextcloud, and whether running more
 * downloads at once helps. Answers the two questions migrate-image-derivatives raises, which is
 * network-bound end to end (the sharp encode is ~100ms against seconds of transfer per image):
 * whether its `CONCURRENCY` is worth raising, and whether the migration should run on the laptop
 * or on a host nearer the storage. Run it on both and compare.
 *
 * Downloads only. No PUT, no DELETE, and no write to the database.
 *
 *   npx tsx src/lib/db/scripts/probe-storage-throughput.ts --dir=/topos
 *   npx tsx src/lib/db/scripts/probe-storage-throughput.ts --from-db --per-level=8
 *
 * Reading the table: MB/s climbing while median file time stays flat means each connection is
 * throttled, so raising CONCURRENCY pays off. MB/s flat while median file time inflates means the
 * link is already saturated and only a different host will help.
 */
// Not just for `--from-db`: `connectNextcloud` reads `process.env`, and nothing else here loads it.
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { FileStat } from 'webdav'
import { DERIVATIVE_QUALITY, DERIVATIVE_SIZES, isDerivableImage, orientedDimensions } from '../../images/derivatives'
import { connectNextcloud, inParallel, rethrowUnlessMissing, type NextcloudDav } from './nextcloud'

/** Downloads per concurrency level, never below the highest level or that level cannot fill its
 *  pool. Each level gets its own files, so this times the level count is both how many distinct
 *  images the run needs and how much it transfers (80 images, roughly 180MB, at the defaults). */
const PER_LEVEL = 16

const LEVELS = [1, 2, 4, 8, 16]

const DIR = '/topos'

/** Images the `--simulate` mode downloads and encodes for real. */
const SAMPLE = 24

/** What migrate-image-derivatives itself uses, so the projection describes that script. Override
 *  with `--concurrency=` to find out what changing it there would buy. */
const SIMULATE_CONCURRENCY = 4

/** Round-trip samples, of which the probe reports the median. */
const LATENCY_SAMPLES = 5

const mb = (bytes: number): number => bytes / 1024 / 1024

const took = (seconds: number): string =>
  seconds < 90 ? `${seconds.toFixed(0)} s` : `${(seconds / 60).toFixed(0)} min`

/** `NaN` on an empty list rather than `undefined`, which the return type would not admit to. */
const median = (numbers: number[]): number =>
  numbers.length === 0 ? NaN : [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)]

/** A stored path and what it costs to fetch. Sizes come from folder listings, never a stat per
 *  file: one PROPFIND per folder answers for everything in it. */
interface Image {
  bytes: number
  path: string
  /** What migrate-image-derivatives will actually read: promotion runs FIRST and replaces the file
   *  with its `.orig`, so simulating against the current file measures the wrong, smaller thing. */
  source: { bytes: number; path: string }
}

/** What the probe learned about a set of images, including the one input that decides how long
 *  migrate-promote-originals takes: how many of them have a pristine sibling to promote. */
interface Listing {
  images: Image[]
  withOrig: number
}

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** `138.jpg` → `138.orig.jpg`, the same sibling `origPathOf` looks for, extension included. */
const origNameOf = (name: string): string => name.replace(/\.([^./]+)$/, '.orig.$1')

/** Size by basename for one folder. */
const sizesIn = async ({ dav, userPath }: NextcloudDav, dir: string): Promise<Map<string, number>> => {
  const entries = (await dav.getDirectoryContents(userPath(dir))) as FileStat[]

  return new Map(entries.filter((entry) => entry.type === 'file').map((entry) => [entry.basename, entry.size]))
}

/** Every derivable original in one folder. */
const listFolder = async (nextcloud: NextcloudDav, dir: string): Promise<Listing> => {
  const sizes = await sizesIn(nextcloud, dir)
  const names = [...sizes.keys()].filter(isDerivableImage)

  const sourceOf = (name: string) => {
    const orig = origNameOf(name)
    return sizes.has(orig)
      ? { bytes: sizes.get(orig)!, path: `${dir}/${orig}` }
      : { bytes: sizes.get(name)!, path: `${dir}/${name}` }
  }

  return {
    images: names.map((name) => ({ bytes: sizes.get(name)!, path: `${dir}/${name}`, source: sourceOf(name) })),
    withOrig: names.filter((name) => sizes.has(origNameOf(name))).length,
  }
}

/**
 * The paths the migration itself would walk. Selects `path` alone on purpose: production has not
 * run 0074 yet, so `files.width` does not exist there and selecting the whole row would fail.
 * A path the folder listing does not know is already gone, so it is dropped rather than counted.
 */
const listFromDatabase = async (nextcloud: NextcloudDav): Promise<Listing> => {
  const [{ default: drizzleConfig }, { default: Database }] = await Promise.all([
    import('../../../../drizzle.config'),
    import('postgres'),
  ])

  if (drizzleConfig.dbCredentials.url === '') {
    throw new Error('DATABASE_URL must be set for --from-db')
  }

  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  let paths: string[]

  try {
    const rows = await postgres<{ path: string }[]>`select distinct path from files`
    paths = rows.map((row) => row.path).filter(isDerivableImage)
  } finally {
    await postgres.end()
  }

  const folders = [...new Set(paths.map(parentOf))]
  const sizes = new Map(
    (await Promise.all(folders.map(async (dir) => [dir, await sizesIn(nextcloud, dir)] as const))).map(
      ([dir, entries]) => [dir, entries],
    ),
  )

  const present = paths.filter((path) => sizes.get(parentOf(path))?.has(nameOf(path)) === true)

  const sourceOf = (path: string) => {
    const folder = sizes.get(parentOf(path))!
    const orig = origNameOf(nameOf(path))
    return folder.has(orig)
      ? { bytes: folder.get(orig)!, path: `${parentOf(path)}/${orig}` }
      : { bytes: folder.get(nameOf(path))!, path }
  }

  return {
    images: present.map((path) => ({
      bytes: sizes.get(parentOf(path))!.get(nameOf(path))!,
      path,
      source: sourceOf(path),
    })),
    withOrig: present.filter((path) => sizes.get(parentOf(path))!.has(origNameOf(nameOf(path)))).length,
  }
}

/**
 * Levels of near-equal total bytes, so their throughputs are comparable. Disjoint sets alone are
 * not enough: dealt in listing order they differ several-fold in size, and the MB/s column then
 * compares different workloads rather than different concurrencies.
 *
 * Snake order (0,1,2 then 2,1,0), because every level must hold the same COUNT of files. Dealing
 * each row to the lightest level looks better and is not: the count cap forces heavy levels to keep
 * taking files anyway, and the last level came out 40% light. A snake pairs each big file with a
 * small one by construction.
 */
const balance = (images: Image[], buckets: number, perBucket: number): Image[][] => {
  const heaviestFirst = [...images].sort((a, b) => b.bytes - a.bytes).slice(0, buckets * perBucket)
  const levels: Image[][] = Array.from({ length: buckets }, () => [])

  heaviestFirst.forEach((image, rank) => {
    const row = Math.floor(rank / buckets)
    const position = rank % buckets
    levels[row % 2 === 0 ? position : buckets - 1 - position].push(image)
  })

  return levels
}

/**
 * A sample whose size distribution mirrors the population, taken at evenly spaced ranks. Sampling
 * the heaviest N instead (what `balance` does, correctly, for the levels) overstates every per-image
 * cost, and the projection built on it is then wrong in the expensive direction.
 */
const spread = (images: Image[], count: number): Image[] => {
  const bySize = [...images].sort((a, b) => a.source.bytes - b.source.bytes)

  return bySize.length <= count
    ? bySize
    : Array.from({ length: count }, (_, index) => bySize[Math.floor(((index + 0.5) * bySize.length) / count)])
}

/** What a serial script pays per file before a single byte moves. */
const measureLatency = async ({ dav, userPath }: NextcloudDav, path: string): Promise<number> => {
  const samples: number[] = []

  for (let index = 0; index < LATENCY_SAMPLES; index += 1) {
    const started = performance.now()
    await dav.stat(userPath(path))
    samples.push(performance.now() - started)
  }

  return median(samples)
}

/** The same worker pool as migrate-image-derivatives, so the number describes that script. */
const runLevel = async (
  { dav, userPath }: NextcloudDav,
  paths: string[],
  concurrency: number,
): Promise<{ bytes: number; elapsed: number; medianFile: number; missing: number }> => {
  let cursor = 0
  let bytes = 0
  let missing = 0
  const perFile: number[] = []

  const started = performance.now()
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++]
        const fileStarted = performance.now()

        try {
          // Never `bytes += await ...`: the read happens before the await, so parallel workers
          // overwrite each other and every level but the first silently under-reports.
          const downloaded = ((await dav.getFileContents(userPath(path))) as ArrayBuffer).byteLength
          bytes += downloaded
          perFile.push(performance.now() - fileStarted)
        } catch (err) {
          // A gone file measures nothing, but it must not end a run that takes minutes.
          rethrowUnlessMissing(err)
          missing += 1
        }
      }
    }),
  )

  return { bytes, elapsed: performance.now() - started, medianFile: median(perFile), missing }
}

/**
 * What migrate-image-derivatives does per image, minus its two uploads: download, read the oriented
 * dimensions, encode both webp derivatives. That script cannot be timed directly, because it writes
 * `files.width`, a column production has not got until 0074 runs.
 *
 * Read-only, so the uploads are projected from the round trip rather than measured. Their bytes are
 * roughly a tenth of what comes down, which makes the projection a floor and not a promise.
 */
const simulate = async (
  { dav, userPath }: NextcloudDav,
  images: Image[],
  concurrency: number,
  latency: number,
  population: number,
): Promise<void> => {
  let downloadMs = 0
  let encodeMs = 0
  let derivedBytes = 0
  let sourceBytes = 0
  let done = 0

  const started = performance.now()

  await inParallel(images, concurrency, async (image) => {
    let buffer: Buffer

    try {
      const from = performance.now()
      buffer = Buffer.from((await dav.getFileContents(userPath(image.source.path))) as ArrayBuffer)
      downloadMs += performance.now() - from
      sourceBytes += buffer.length
    } catch (err) {
      rethrowUnlessMissing(err)
      return
    }

    const from = performance.now()
    orientedDimensions(await sharp(buffer).metadata())
    let bytes = 0
    for (const size of DERIVATIVE_SIZES) {
      const webp = await sharp(buffer)
        .rotate()
        .resize({ fit: 'inside', height: size, width: size, withoutEnlargement: true })
        .webp({ quality: DERIVATIVE_QUALITY })
        .toBuffer()
      bytes += webp.length
    }
    encodeMs += performance.now() - from
    derivedBytes += bytes
    done += 1
  })

  const wall = performance.now() - started

  if (done === 0) {
    console.log('\nSimulated nothing: every sampled image is gone.')
    return
  }

  // Scaled by wall clock rather than by summing the parts, which would count the overlap twice.
  //
  // Uploads are the weaker half: round trips divide by concurrency, bytes do not. Taking the larger
  // of the two stops the projection improving with concurrency purely by assumption. The uplink is
  // never measured (this stays read-only), so the download rate stands in for it and is optimistic.
  const throughput = mb(sourceBytes) / (wall / 1000)
  const uploadBytes = (derivedBytes / done) * population
  const uploads = Math.max(
    (population * DERIVATIVE_SIZES.length * (latency / 1000)) / concurrency,
    mb(uploadBytes) / throughput,
  )
  console.log(
    `\nSimulated ${done} image(s) at concurrency ${concurrency}, ` +
      `median ${mb(median(images.map((image) => image.source.bytes))).toFixed(2)} MB of SOURCE (post-promotion): ` +
      `${(downloadMs / done / 1000).toFixed(2)} s download and ${(encodeMs / done / 1000).toFixed(2)} s encode per image, ` +
      `${(derivedBytes / done / 1024).toFixed(0)} KB of derivatives each.`,
  )
  console.log(`Throughput at that concurrency: ${(mb(sourceBytes) / (wall / 1000)).toFixed(2)} MB/s aggregate.`)
  console.log(
    `migrate-image-derivatives over ${population} image(s) at concurrency ${concurrency}: ` +
      `~${took((wall / done / 1000) * population + uploads)} ` +
      `(${took((wall / done / 1000) * population)} measured here, plus ~${took(uploads)} for ${mb(uploadBytes).toFixed(0)} MB of uploads, modelled).`,
  )
}

export const probe = async ({
  dir = DIR,
  fromDb = false,
  levels = LEVELS,
  perLevel = PER_LEVEL,
  sample = SAMPLE,
  simulateConcurrency = SIMULATE_CONCURRENCY,
  simulateOnly = false,
}: {
  dir?: string
  fromDb?: boolean
  levels?: number[]
  perLevel?: number
  sample?: number
  simulateConcurrency?: number
  simulateOnly?: boolean
} = {}) => {
  const nextcloud = await connectNextcloud()
  const { images, withOrig } = fromDb ? await listFromDatabase(nextcloud) : await listFolder(nextcloud, dir)

  if (images.length === 0) {
    throw new Error(fromDb ? 'No derivable image paths in `files`' : `No images in "${dir}", pass --dir=<folder>`)
  }

  const total = images.reduce((sum, image) => sum + image.bytes, 0)
  // What derivatives will read, which is not what is stored today: promotion replaces 716 of these
  // with their larger `.orig` first.
  const sourceTotal = images.reduce((sum, image) => sum + image.source.bytes, 0)
  const wanted = perLevel * levels.length
  const sets = balance(images, levels.length, perLevel)

  console.log(
    `${images.length} image(s) from ${fromDb ? 'the files table' : dir}, ` +
      `${mb(total).toFixed(0)} MB total, median ${mb(median(images.map((image) => image.bytes))).toFixed(2)} MB` +
      (sourceTotal === total
        ? ''
        : `\nAfter promotion (what derivatives reads): ${mb(sourceTotal).toFixed(0)} MB, ` +
          `${(sourceTotal / total).toFixed(2)}x today's bytes`),
  )
  // Fewer files than workers means the pool never reaches the level it claims to measure. Neither
  // warning says anything about `--simulate`, which does not use the levels at all.
  if (!simulateOnly && perLevel < Math.max(...levels)) {
    console.log(`WARNING: --per-level=${perLevel} is below the highest level, so those rows under-measure.`)
  }
  if (!simulateOnly && images.length < wanted) {
    console.log(`WARNING: only ${images.length} image(s) for ${wanted} downloads, so the levels are uneven.`)
  }
  const latency = await measureLatency(nextcloud, images[0].path)
  console.log(`Round trip (PROPFIND): ${latency.toFixed(0)} ms`)

  if (simulateOnly) {
    await simulate(nextcloud, spread(images, sample), simulateConcurrency, latency, images.length)
    return
  }

  console.log('concurrency   files      MB   wall(s)   MB/s   median file(s)')

  let best = 0

  for (const [position, concurrency] of levels.entries()) {
    const level = sets[position]
    if (level.length === 0) {
      continue
    }

    const { bytes, elapsed, medianFile, missing } = await runLevel(
      nextcloud,
      level.map((image) => image.path),
      concurrency,
    )
    const seconds = elapsed / 1000
    best = Math.max(best, bytes === 0 ? 0 : mb(bytes) / seconds)

    // Every file of a level can be gone, and a row of `NaN` reads as a broken probe rather than
    // as missing data.
    const rate = bytes === 0 ? '-' : (mb(bytes) / seconds).toFixed(2)
    const file = Number.isNaN(medianFile) ? '-' : (medianFile / 1000).toFixed(2)

    console.log(
      `${String(concurrency).padStart(11)}${String(level.length - missing).padStart(8)}` +
        `${mb(bytes).toFixed(1).padStart(8)}${seconds.toFixed(1).padStart(10)}` +
        `${rate.padStart(7)}${file.padStart(17)}` +
        (missing === 0 ? '' : `   (${missing} gone)`),
    )
  }

  // The download half only. The encode is ~100ms per image and the derivative upload is a fraction
  // of what comes down, but a cold cache and per-file overhead both push the real run above this.
  if (best > 0) {
    console.log(
      `\nPulling all ${mb(total).toFixed(0)} MB at the best rate seen (${best.toFixed(2)} MB/s): ~${took(mb(total) / best)}.`,
    )
  }

  // migrate-promote-originals only pays for an image that HAS a sibling, and it pays serially: one
  // round trip for the two range reads it compares, one for the MOVE.
  const promote = withOrig * 2 * (latency / 1000)
  console.log(
    `${withOrig} of ${images.length} image(s) have an .orig sibling. ` +
      `migrate-promote-originals is serial at 2 round trips each: ~${took(promote)}, ` +
      `~${took(promote / 4)} if it ran 4 at a time.`,
  )
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = (name: string): string | undefined =>
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]

  const levels = flag('levels')?.split(',').map(Number)

  await probe({
    dir: flag('dir'),
    fromDb: process.argv.includes('--from-db'),
    levels: levels?.every((level) => level > 0) ? levels : undefined,
    perLevel: flag('per-level') == null ? undefined : Number(flag('per-level')),
    sample: flag('sample') == null ? undefined : Number(flag('sample')),
    simulateConcurrency: flag('concurrency') == null ? undefined : Number(flag('concurrency')),
    simulateOnly: process.argv.includes('--simulate'),
  })
}
