import { CRON_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { STAGING_BUCKET } from '$lib/entities/file/upload'
import { getVideoProvider } from '$lib/videos/provider.server'
import { createClient } from '@supabase/supabase-js'
import { json } from '@sveltejs/kit'
import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from './$types'

/** Staging orphans past this age are abandoned-form or failed-finalize leftovers. */
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Bunny orphans past this age are dead: the TUS resume window is 24h, so 48h clears clock skew too. */
const BUNNY_MAX_AGE_MS = 48 * 60 * 60 * 1000

/** Same x-api-key gate the pg_cron caller uses (mirrors the 1.0 notifications cron). */
const authorized = (request: Request): boolean => {
  const key = request.headers.get('x-api-key')
  if (key == null || key.length === 0 || CRON_API_KEY.length === 0) {
    return false
  }
  try {
    return timingSafeEqual(Buffer.from(key), Buffer.from(CRON_API_KEY))
  } catch {
    return false
  }
}

/** Delete staging objects older than the cutoff. Service-role: the sweep spans every user's own-uid folder. */
const sweepStaging = async (before: Date): Promise<number> => {
  const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const bucket = admin.storage.from(STAGING_BUCKET)
  // ponytail: two-level walk (folders are per auth-uid), 100 objects/page. Fine for
  // a daily job; switch to the S3 list API if the user count ever outgrows one page.
  const { data: folders, error } = await bucket.list()
  if (error != null || folders == null) {
    console.error('[cleanup] staging list failed', error)
    return 0
  }
  let removed = 0
  for (const folder of folders) {
    if (folder.id != null) {
      continue // a stray file at the bucket root, not a uid folder
    }
    const { data: objects, error: listError } = await bucket.list(folder.name)
    if (listError != null || objects == null) {
      console.error('[cleanup] staging list failed for folder', folder.name, listError)
      continue
    }
    const stale = objects
      .filter((object) => object.created_at != null && new Date(object.created_at) < before)
      .map((object) => `${folder.name}/${object.name}`)
    if (stale.length > 0) {
      const { error: removeError } = await bucket.remove(stale)
      if (removeError != null) {
        console.error('[cleanup] staging remove failed', stale, removeError)
        continue
      }
      // Audit trail: log exactly what was deleted so a wrong sweep is diagnosable.
      console.log('[cleanup] removed staging objects', stale)
      removed += stale.length
    }
  }
  return removed
}

/**
 * Delete Bunny videos created but never uploaded (still placeholder-titled) past
 * the cutoff. Title-based, NOT a DB diff: the Bunny library is shared with other
 * tenants whose videos have no `bunny_streams` row here, so a diff would delete
 * theirs. Mid-upload aborts (title already changed) are left as an accepted leak.
 */
const sweepBunny = async (before: Date): Promise<number> => {
  const provider = getVideoProvider()
  const guids = await provider.listStaleUploads(before)
  if (guids.length > 0) {
    // Audit trail: log every deleted GUID so a wrong sweep is diagnosable.
    console.log('[cleanup] removing orphaned videos', guids)
  }
  let removed = 0
  for (const guid of guids) {
    // Isolate per-GUID failures: one Bunny 5xx must not abort the rest of the sweep.
    try {
      await provider.remove(guid)
      removed += 1
    } catch (error) {
      console.error('[cleanup] video remove failed', guid, error)
    }
  }
  return removed
}

export const POST: RequestHandler = async ({ request }) => {
  if (!authorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = Date.now()
  const [staging, bunny] = await Promise.all([
    sweepStaging(new Date(now - STAGING_MAX_AGE_MS)),
    sweepBunny(new Date(now - BUNNY_MAX_AGE_MS)),
  ])
  console.log(`[cleanup] removed ${staging} staging objects, ${bunny} orphaned videos`)
  return json({ bunny, staging })
}
