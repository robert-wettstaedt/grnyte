import { resolve } from '$app/paths'
import { redirect } from '@sveltejs/kit'

/**
 * The cookie policy is gone. Storage on the visitor's device is functional only (an auth session,
 * preferences, the service worker cache), which section 25(2) Nr. 2 TDDDG exempts from consent, so
 * there was no consent to document and no banner to explain. What is stored now lives in the
 * device-storage section of the privacy notice.
 *
 * The route survives as a permanent redirect because the 1.0 footer shipped this URL and bookmarks,
 * shared links and search results live outside the database.
 */
export const GET = () => redirect(308, resolve('/legal/privacy'))
