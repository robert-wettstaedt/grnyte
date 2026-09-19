import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import sharp from 'sharp'
import { createClient } from 'webdav'
import drizzleConfig from '../../../../drizzle.config'
import { parsePathTokens } from '../../entities/topo/path'
import { orientedDimensions } from '../../images/derivatives'
import * as schema from '../schema'
import { selectTopoPathRows } from './migrate-topo-paths'
import { inParallel, readHead } from './nextcloud'

/**
 * One-time repair: `migrate-topo-paths` divided legacy pixel paths by `files.width`/`height`, but
 * `migrate-promote-originals` had already replaced SOME images with their full-resolution `.orig`,
 * so those paths were divided by a size their points were never drawn against and collapsed toward
 * the top left. Proven on topo 982: `783/4032 = 0.1942` reproduces the stored value exactly from
 * the pre-migration pixels in the 2026-09-18 dump.
 *
 * Which files were promoted comes from Nextcloud's TRASHBIN, which holds exactly the 716 copies the
 * promotion overwrote. A size threshold was the first attempt and it was WRONG: 536 of 1340 paths
 * never had an `.orig` at all, so their stored image was always full size and their paths were
 * always correct. Rescaling one of those corrupts it, and the bounds check catches that only when
 * the line is long enough to overflow.
 *
 * DRY RUN by default, and the plan and its revert are written BEFORE any UPDATE, so an interrupted
 * run still leaves a complete record.
 *   CONFIRM=true   apply
 *   TOPO_ID=982    limit to one topo
 *   SKIP_IDS=1,2   leave these rows alone
 */

if (process.argv.length > 2) {
  throw new Error(
    `fix-topo-path-scale: unexpected argument(s) ${process.argv.slice(2).join(' ')}. This script is a DRY RUN by default; set CONFIRM=true to commit.`,
  )
}

const CONFIRM = process.env.CONFIRM === 'true'
const TOPO_ID = process.env.TOPO_ID == null ? undefined : Number(process.env.TOPO_ID)
const SKIP_IDS = new Set((process.env.SKIP_IDS ?? '').split(',').filter(Boolean).map(Number))
/** `pg_restore --data-only --table=topo_routes` of a PRE-migration dump. Required: it is what turns
 *  this from an inference into a verification. */
const PREMIGRATION = process.env.PREMIGRATION

/** Enough for the SOF marker of every image measured so far, as in `migrate-promote-originals`. */
const HEADER_BYTES = 64 * 1024

/**
 * A scale this script must derive on its own from the trashbin, or it is not reading what it thinks
 * it is. Topo 982's photo is 4032x3024 now and was 1366x1024 before promotion, established from the
 * pre-migration dump before this script existed, and verified by eye against the rock.
 */
const ANCHOR = { height: 3024, path: '/topos/f296xozbyfktn0fti7dx5cak.jpg', scale: 3024 / 1024, width: 4032 }

/** Same precision `migrate-topo-paths` wrote, so a repaired row is indistinguishable from a correct one. */
const round = (value: number): number => Number(value.toFixed(5))

/**
 * Multiply every coordinate by `scale`. `null` with a reason when the row must be left alone: the
 * path does not parse, the result leaves the image, or the output does not read back. The negative
 * tolerance is wider than the positive one because a topout is drawn slightly above the top edge.
 */
export const scalePath = (
  path: string,
  scale: number,
): { next: null; reason: 'out-of-bounds' | 'roundtrip' | 'unparsable' } | { next: string } => {
  const tokens = parsePathTokens(path)
  if (tokens == null || tokens.length === 0) {
    return { next: null, reason: 'unparsable' }
  }

  const parsed = tokens.map((token) => (token === 'Z' ? token : { ...token, x: token.x * scale, y: token.y * scale }))
  const points = parsed.filter((token) => token !== 'Z') as { x: number; y: number }[]
  if (points.some((point) => point.x < -0.08 || point.x > 1.05 || point.y < -0.08 || point.y > 1.05)) {
    return { next: null, reason: 'out-of-bounds' }
  }

  const next = parsed
    .map((token) => (token === 'Z' ? 'Z' : `${token.letter}${round(token.x)},${round(token.y)}`))
    .join(' ')

  const reparsed = parsePathTokens(next)
  if (reparsed == null || reparsed.length !== parsed.length) {
    return { next: null, reason: 'roundtrip' }
  }
  return { next }
}

/**
 * Stored path of every file the promotion overwrote, mapped to its copy in the trashbin. Nextcloud
 * exposes the original location only through its own property, which the listing helper does not
 * request, so this is a raw PROPFIND. Parsed with a regex rather than by adding `fast-xml-parser`,
 * which is only a transitive dependency; the throw below is what makes that safe, because a parse
 * that silently matched nothing would otherwise read as "nothing was promoted".
 */
const trashbinIndex = async (): Promise<Map<string, string>> => {
  const { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } = process.env
  if (NEXTCLOUD_URL == null || NEXTCLOUD_USER_NAME == null || NEXTCLOUD_USER_PASSWORD == null) {
    throw new Error('NEXTCLOUD_URL / NEXTCLOUD_USER_NAME / NEXTCLOUD_USER_PASSWORD must be set')
  }

  const response = await fetch(`${NEXTCLOUD_URL}/remote.php/dav/trashbin/${NEXTCLOUD_USER_NAME}/trash`, {
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><nc:trashbin-original-location/></d:prop></d:propfind>`,
    headers: {
      Authorization: `Basic ${Buffer.from(`${NEXTCLOUD_USER_NAME}:${NEXTCLOUD_USER_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'application/xml',
      Depth: '1',
    },
    method: 'PROPFIND',
  })
  if (!response.ok) {
    throw new Error(`trashbin PROPFIND failed: ${response.status}`)
  }

  const xml = await response.text()
  const index = new Map<string, string>()
  let blocks = 0

  for (const block of xml.split(/<\/[a-z]*:?response>/i)) {
    const href = /<[a-z]*:?href[^>]*>([^<]+)</i.exec(block)?.[1]
    if (href == null) {
      continue
    }
    blocks += 1
    const original = /<[a-z]*:?trashbin-original-location[^>]*>([^<]+)</i.exec(block)?.[1]
    if (original == null) {
      continue
    }
    index.set(`/${decodeURIComponent(original).replace(/^\/+/, '')}`, decodeURIComponent(href))
  }

  console.log(`trashbin: ${blocks} entries, ${index.size} with an original location`)
  if (index.size === 0) {
    throw new Error('no original locations parsed out of the trashbin: refusing to guess which files were promoted')
  }
  return index
}

/**
 * id -> pixel path, out of a `COPY` block. The column order is read from the COPY header rather
 * than assumed, because a dump from a different schema version would otherwise silently line up
 * the wrong column and every row would look edited.
 */
export const parsePremigration = (dump: string): Map<number, string> => {
  const lines = dump.split('\n')
  const start = lines.findIndex((line) => /^COPY\s+(public\.)?topo_routes\s*\(/i.test(line))
  if (start < 0) {
    throw new Error('no COPY block for topo_routes in the pre-migration dump')
  }

  const columns = (/\(([^)]+)\)/.exec(lines[start])?.[1] ?? '').split(',').map((name) => name.trim())
  const idAt = columns.indexOf('id')
  const pathAt = columns.indexOf('path')
  if (idAt < 0 || pathAt < 0) {
    throw new Error(`COPY header has no id/path column: ${columns.join(', ')}`)
  }

  const out = new Map<number, string>()
  for (const line of lines.slice(start + 1)) {
    if (line === '\\.') {
      break
    }
    const cells = line.split('\t')
    if (cells.length <= Math.max(idAt, pathAt) || cells[pathAt] === '\\N') {
      continue
    }
    out.set(Number(cells[idAt]), cells[pathAt])
  }
  return out
}

/** What `migrate-topo-paths` would have written for these pixels at this size. */
export const asMigrationWrote = (pixels: string, width: number, height: number): null | string => {
  const tokens = parsePathTokens(pixels)
  if (tokens == null || tokens.length === 0) {
    return null
  }
  return tokens
    .map((token) => (token === 'Z' ? 'Z' : `${token.letter}${round(token.x / width)},${round(token.y / height)}`))
    .join(' ')
}

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = true }: { dryRun?: boolean } = {}) => {
  const { NEXTCLOUD_PASSWORD, NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } = process.env
  const dav = createClient(String(NEXTCLOUD_URL), {
    password: String(NEXTCLOUD_USER_PASSWORD ?? NEXTCLOUD_PASSWORD),
    username: String(NEXTCLOUD_USER_NAME),
  })

  if (PREMIGRATION == null || PREMIGRATION === '') {
    throw new Error('PREMIGRATION must point at a pre-migration pg_restore of topo_routes')
  }
  const premigration = parsePremigration(readFileSync(PREMIGRATION, 'utf8'))
  console.log(`pre-migration rows: ${premigration.size}`)

  const index = await trashbinIndex()

  /**
   * Pre-promotion dimensions from the copy the trashbin kept. `not-promoted` and `unreadable` are
   * kept apart deliberately: the first means leave the row alone because it was always correct,
   * the second means we could not tell, and collapsing the two is how a file gets skipped for the
   * wrong reason.
   */
  type OldSize = 'not-promoted' | 'unreadable' | { height: number; width: number }
  const sizes = new Map<string, OldSize>()
  const oldSizeOf = async (storedPath: string): Promise<OldSize> => {
    const cached = sizes.get(storedPath)
    if (cached !== undefined) {
      return cached
    }

    const href = index.get(storedPath)
    let result: OldSize = 'not-promoted'
    if (href != null) {
      // A header read is two orders of magnitude cheaper, but the SOF marker sits past 64KB in a
      // progressive JPEG or one carrying a large EXIF block, so fall back to the whole file.
      for (const bytes of [HEADER_BYTES, 0]) {
        try {
          const buffer =
            bytes === 0
              ? Buffer.from((await dav.getFileContents(href)) as ArrayBuffer)
              : await readHead(dav, href, bytes)
          result = orientedDimensions(await sharp(buffer).metadata()) ?? 'unreadable'
          break
        } catch {
          result = 'unreadable'
        }
      }
      if (result === 'unreadable') {
        console.warn(`could not measure ${href}`)
      }
    }

    sizes.set(storedPath, result)
    return result
  }

  // Before any row is considered: the method has to reproduce a scale we already know.
  const anchor = await oldSizeOf(ANCHOR.path)
  if (typeof anchor === 'string') {
    throw new Error(`anchor ${ANCHOR.path} is ${anchor}: cannot verify the method`)
  }
  const anchorScale = Math.min(ANCHOR.width, ANCHOR.height) / Math.min(anchor.width, anchor.height)
  if (Math.abs(anchorScale - ANCHOR.scale) > 0.001) {
    throw new Error(`anchor scale is ${anchorScale}, expected ${ANCHOR.scale}: refusing to run`)
  }
  console.log(`anchor ${ANCHOR.path}: was ${anchor.width}x${anchor.height}, scale ${anchorScale}`)

  const rows = await selectTopoPathRows(db)

  // Measure every promoted file up front, four at a time and with progress. Serial and silent, a
  // few hundred header reads at a ~320ms round trip look exactly like a hang.
  const toMeasure = [...new Set(rows.map((row) => row.filePath).filter((path) => path != null && index.has(path)))]
  let measured = 0
  console.log(`measuring ${toMeasure.length} promoted file(s)`)
  await inParallel(toMeasure as string[], 4, async (path) => {
    await oldSizeOf(path)
    measured += 1
    if (measured % 25 === 0 || measured === toMeasure.length) {
      console.log(`  ${measured}/${toMeasure.length}`)
    }
  })

  const plan: { after: string; before: string; file: string; id: number; scale: number; size: string; topo: number }[] =
    []
  const skipped: Record<string, number[]> = {}
  const skip = (reason: string, id: number) => void (skipped[reason] ??= []).push(id)

  for (const row of rows) {
    if (row.path == null || row.width == null || row.height == null || row.filePath == null) {
      skip('no dimensions', row.id)
      continue
    }
    if (TOPO_ID != null && row.topoId !== TOPO_ID) {
      continue
    }
    if (SKIP_IDS.has(row.id)) {
      skip('skipped by request', row.id)
      continue
    }

    const old = await oldSizeOf(row.filePath)
    if (typeof old === 'string') {
      skip(old, row.id)
      continue
    }

    // The resize fixed the SHORTER edge exactly and rounded the longer one, so the shorter ratio is
    // the exact scale and the longer one is the cross-check.
    const scale = Math.min(row.width, row.height) / Math.min(old.width, old.height)
    const other = Math.max(row.width, row.height) / Math.max(old.width, old.height)
    if (Math.abs(scale - other) / scale > 0.005) {
      skip(`aspect changed (${scale.toFixed(4)} vs ${other.toFixed(4)})`, row.id)
      continue
    }
    if (scale <= 1.001) {
      skip('not enlarged', row.id)
      continue
    }

    // The row must be exactly what the migration wrote, or it has been edited since and its path
    // is already correct. Without this, a topo redrawn in the app today gets scaled a second time.
    const pixels = premigration.get(row.id)
    if (pixels == null) {
      skip('not in the pre-migration dump', row.id)
      continue
    }
    if (asMigrationWrote(pixels, row.width, row.height) !== row.path) {
      skip('edited since the migration', row.id)
      continue
    }

    const result = scalePath(row.path, scale)
    if (result.next == null) {
      skip(result.reason, row.id)
      continue
    }

    plan.push({
      after: result.next,
      before: row.path,
      file: row.filePath,
      id: row.id,
      scale,
      size: `${old.width}x${old.height} -> ${row.width}x${row.height}`,
      topo: row.topoId,
    })
  }

  // Crumbs FIRST, so an interrupted write still leaves a complete record of what it intended.
  const stamp = Date.now()
  writeFileSync(`topo-fix-plan-${stamp}.json`, JSON.stringify(plan, null, 2))
  writeFileSync(
    `topo-fix-revert-${stamp}.sql`,
    `begin;\n${plan
      .map((entry) => `update topo_routes set path = '${entry.before.replaceAll("'", "''")}' where id = ${entry.id};`)
      .join('\n')}\ncommit;\n`,
  )
  console.log(`wrote topo-fix-plan-${stamp}.json and topo-fix-revert-${stamp}.sql`)

  if (!dryRun) {
    for (const entry of plan) {
      await db.update(schema.topoRoutes).set({ path: entry.after }).where(eq(schema.topoRoutes.id, entry.id))
    }
  }

  for (const entry of plan.slice(0, 5)) {
    console.log(`\n#${entry.id}  ${entry.size}  x${entry.scale.toFixed(5)}`)
    console.log(`  before ${entry.before}`)
    console.log(`  after  ${entry.after}`)
  }
  console.log(`\n${plan.length} path(s) ${dryRun ? 'would be' : ''} rescaled`)
  for (const [reason, ids] of Object.entries(skipped)) {
    console.log(`  ${reason}: ${ids.length}${reason === 'not-promoted' ? '' : ` -> ${ids.join(', ')}`}`)
  }

  return plan.length
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = Database(drizzleConfig.dbCredentials.url, { max: 1, prepare: false })
  await migrate(drizzle(sql, { schema }), { dryRun: !CONFIRM })
  if (!CONFIRM) {
    console.log('\nDRY RUN - nothing written. Set CONFIRM=true to commit.')
  }
  await sql.end()
}
