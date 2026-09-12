import { CRON_API_KEY } from '$env/static/private'
import { timingSafeEqual } from 'node:crypto'

/** The x-api-key gate every pg_cron task route shares. Unset secret denies, never allows. */
export function isCronAuthorized(request: Request): boolean {
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
