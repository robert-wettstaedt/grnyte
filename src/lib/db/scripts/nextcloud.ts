/**
 * WebDAV access for the storage migrations. The app's image access goes through the ImageProvider,
 * but that module reads `$env/static/private` (SvelteKit-only), so these scripts talk WebDAV directly.
 */
import { createClient, type WebDAVClient } from 'webdav'

export interface NextcloudDav {
  dav: WebDAVClient
  /** A stored path (`/topos/138.jpg`) prefixed with the user folder the client is rooted above. */
  userPath: (path: string) => string
}

/**
 * Throws when the credentials are missing, so a migration stops before it reports success, and
 * again when the one probe PROPFIND fails: unreachable storage otherwise reads as "every file is
 * unreadable", which each script reports as a per-file skip and still exits 0 on.
 */
export const connectNextcloud = async (): Promise<NextcloudDav> => {
  const { NEXTCLOUD_URL, NEXTCLOUD_USER_NAME, NEXTCLOUD_USER_PASSWORD } = process.env
  if (NEXTCLOUD_URL == null || NEXTCLOUD_USER_NAME == null || NEXTCLOUD_USER_PASSWORD == null) {
    throw new Error('NEXTCLOUD_URL / NEXTCLOUD_USER_NAME / NEXTCLOUD_USER_PASSWORD must be set')
  }

  const dav = createClient(`${NEXTCLOUD_URL}/remote.php/dav/files`, {
    password: NEXTCLOUD_USER_PASSWORD,
    username: NEXTCLOUD_USER_NAME,
  })

  try {
    await dav.getDirectoryContents(NEXTCLOUD_USER_NAME)
  } catch (err) {
    throw new Error(`Nextcloud unreachable at ${NEXTCLOUD_URL}`, { cause: err })
  }

  return { dav, userPath: (path) => `${NEXTCLOUD_USER_NAME}${path}` }
}

/** A 404 is the one WebDAV failure that means "this file is gone" rather than "storage is broken". */
const isMissing = (err: unknown): boolean => {
  const status = (err as null | { status?: unknown })?.status
  return typeof status === 'number' ? status === 404 : / 404\b/.test(err instanceof Error ? err.message : String(err))
}

/**
 * One PROPFIND per folder, promise-cached so concurrent workers never list the same one twice.
 * Only a 404 degrades to an empty listing: on any other error an empty one would read as "nothing
 * to do here" and the migration would report success having skipped everything.
 */
export const listingCache = ({ dav, userPath }: NextcloudDav): ((dir: string) => Promise<Set<string>>) => {
  const cache = new Map<string, Promise<Set<string>>>()
  return (dir) => {
    let listing = cache.get(dir)
    if (listing == null) {
      listing = dav
        .getDirectoryContents(userPath(dir))
        .then((entries) => new Set(entries.map((entry) => entry.basename)))
        .catch((err: unknown) => {
          if (!isMissing(err)) throw err
          console.warn(`Could not list "${dir}":`, err instanceof Error ? err.message : err)
          return new Set<string>()
        })
      cache.set(dir, listing)
    }
    return listing
  }
}

/** Per-file download failures: a missing file is skippable, anything else means storage is down. */
export const rethrowUnlessMissing = (err: unknown): void => {
  if (!isMissing(err)) throw err
}
