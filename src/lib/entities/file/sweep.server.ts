import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { STAGING_BUCKET } from '$lib/entities/file/upload'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { getVideoProvider } from '$lib/videos/provider.server'

/** Staging orphans past this age are abandoned-form or failed-finalize leftovers. */
export const STAGING_MAX_AGE_MS = DAY_MS

/** Bunny orphans past this age are dead: the TUS resume window is 24h, so 48h clears clock skew too. */
export const BUNNY_MAX_AGE_MS = 48 * 60 * 60 * 1000

/** Objects per storage `list` call; the API's own default is 100. */
const LIST_PAGE = 1000

type StagingBucket = ReturnType<ReturnType<typeof supabaseAdmin>['storage']['from']>

/** Every entry under `prefix`, page by page: one `list` call stops at its limit, silently. Read in
 *  full before anything is removed, so the deletes cannot shift the offsets under the walk. */
const listAll = async (bucket: StagingBucket, prefix?: string): ReturnType<StagingBucket['list']> => {
  const entries = []
  for (let offset = 0; ; offset += LIST_PAGE) {
    const page = await bucket.list(prefix, { limit: LIST_PAGE, offset })
    if (page.error != null) {
      return page
    }
    entries.push(...page.data)
    if (page.data.length < LIST_PAGE) {
      return { data: entries, error: null }
    }
  }
}

/** Delete staging objects older than the cutoff. Service-role: the sweep spans every user's own-uid folder. */
export const sweepStaging = async (before: Date): Promise<number> => {
  const bucket = supabaseAdmin().storage.from(STAGING_BUCKET)
  // Two levels: one folder per auth uid, the objects inside it.
  const { data: folders, error } = await listAll(bucket)
  if (error != null || folders == null) {
    console.error('[cleanup] staging list failed', error)
    await logServerFailure('cleanup', `staging list failed: ${stringifyError(error)}`)
    return 0
  }
  let removed = 0
  for (const folder of folders) {
    if (folder.id != null) {
      continue // a stray file at the bucket root, not a uid folder
    }
    const { data: objects, error: listError } = await listAll(bucket, folder.name)
    if (listError != null || objects == null) {
      console.error('[cleanup] staging list failed for folder', folder.name, listError)
      await logServerFailure('cleanup', `staging list failed for folder ${folder.name}: ${stringifyError(listError)}`)
      continue
    }
    const stale = objects
      .filter((object) => object.created_at != null && new Date(object.created_at) < before)
      .map((object) => `${folder.name}/${object.name}`)
    if (stale.length > 0) {
      const { error: removeError } = await bucket.remove(stale)
      if (removeError != null) {
        console.error('[cleanup] staging remove failed', stale, removeError)
        // The count, not the paths: each one carries an auth uid and a file name.
        await logServerFailure(
          'cleanup',
          `staging remove failed for ${stale.length} objects: ${stringifyError(removeError)}`,
        )
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
 * Delete Bunny videos created but never uploaded (still placeholder-titled) past the cutoff.
 *
 * Title-based rather than a DB diff, for now. `reportBunnyOrphans` (`file/cleanup.server.ts`) computes the diff
 * alongside without acting on it.
 */
export const sweepBunny = async (before: Date): Promise<number> => {
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
      await logServerFailure('cleanup', `video remove failed for ${guid}: ${stringifyError(error)}`)
    }
  }
  return removed
}
