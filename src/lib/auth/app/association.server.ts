import { env } from '$env/dynamic/private'
import { APP_BUNDLE_ID, APP_LINK_PREFIXES } from './constants'

/** The Android file; the app's intent filters scope its paths. Null until `ANDROID_CERT_SHA256` (a comma list). */
export function androidAssetLinks() {
  if (!env.ANDROID_CERT_SHA256) return null
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: APP_BUNDLE_ID,
        sha256_cert_fingerprints: env.ANDROID_CERT_SHA256.split(',').map((f) => f.trim()),
      },
    },
  ]
}

/** The Apple file: content links, and `webcredentials` for the iOS sign-in return. Apple matches in order, so
 *  the excludes go first. Null until `IOS_APP_ASSOCIATION_ENABLED`: `APPLE_TEAM_ID` is set for web sign-in too. */
export function appleAssociation() {
  if (env.IOS_APP_ASSOCIATION_ENABLED !== 'true' || !env.APPLE_TEAM_ID) return null
  const app = `${env.APPLE_TEAM_ID}.${APP_BUNDLE_ID}`
  const components = [
    { '/': '/auth/*', exclude: true },
    { '/': '/api/*', exclude: true },
    ...APP_LINK_PREFIXES.flatMap((p) => [{ '/': p }, { '/': `${p}/*` }]),
  ]
  return { applinks: { details: [{ appIDs: [app], components }] }, webcredentials: { apps: [app] } }
}
