import { describe, expect, it } from 'vitest'
import {
  assertAppleAssociation,
  assertAssetLinks,
  assertAuthConfig,
  assertGotrueVersion,
  GOTRUE_CONTRACT_VERSION,
  HOOK_URI,
  unconfiguredProviders,
} from './authConfig'

const clients = { appleServicesId: 'app.grnyte.web', googleClientId: 'web.apps.googleusercontent.com' }

const settings = {
  disable_signup: false,
  external: { apple: true, email: true, google: true },
  mailer_autoconfirm: false,
}
const config = {
  disable_signup: false,
  external_anonymous_users_enabled: false,
  external_apple_client_id: 'app.grnyte.web,rocks.grnyte',
  external_apple_enabled: true,
  external_google_client_id: 'web.apps.googleusercontent.com',
  external_google_enabled: true,
  external_google_skip_nonce_check: false,
  external_phone_enabled: false,
  hook_before_user_created_enabled: true,
  hook_before_user_created_uri: HOOK_URI,
  jwt_exp: 3600,
  mailer_notifications_email_changed_enabled: true,
  mailer_notifications_identity_linked_enabled: true,
  mailer_notifications_identity_unlinked_enabled: true,
  mailer_notifications_password_changed_enabled: true,
  mailer_otp_exp: 600,
  mailer_otp_length: 8,
  mailer_secure_email_change_enabled: true,
  rate_limit_email_sent: 30,
  refresh_token_rotation_enabled: true,
  security_manual_linking_enabled: true,
  security_refresh_token_reuse_interval: 10,
  security_update_password_require_reauthentication: true,
}

describe('assertAuthConfig', () => {
  it('passes a complete config', () => {
    expect(assertAuthConfig(settings, config, clients)).toEqual([])
  })

  it('fails with the hook off', () => {
    expect(assertAuthConfig(settings, { ...config, hook_before_user_created_enabled: false }, clients)).toEqual([
      'the before-user-created hook is enabled',
    ])
  })

  it('fails with 6-digit codes', () => {
    expect(assertAuthConfig(settings, { ...config, mailer_otp_length: 6 }, clients)).toEqual([
      'email codes have 8 digits (mailer_otp_length 8)',
    ])
  })

  it("fails with Google's nonce check skipped, naming it", () => {
    expect(assertAuthConfig(settings, { ...config, external_google_skip_nonce_check: true }, clients)).toEqual([
      'Google checks the nonce (external_google_skip_nonce_check false)',
    ])
  })

  it('fails when an app client ID comes before the web one', () => {
    expect(
      assertAuthConfig(settings, { ...config, external_apple_client_id: 'rocks.grnyte,app.grnyte.web' }, clients),
    ).toEqual(['the Apple client IDs start with APPLE_SERVICES_ID'])
  })

  it('skips a provider that is not set up at all, and names it', () => {
    const noGoogle = { ...clients, googleClientId: '' }
    const off = { ...config, external_google_client_id: '', external_google_enabled: false }
    const offSettings = { ...settings, external: { apple: true, email: true, google: false } }
    expect(assertAuthConfig(offSettings, off, noGoogle)).toEqual([])
    expect(unconfiguredProviders(offSettings, off, noGoogle)).toEqual(['Google'])
  })

  it('still fails a provider that is half set up', () => {
    const noGoogle = { ...clients, googleClientId: '' }
    expect(assertAuthConfig(settings, config, noGoogle)).toEqual(['the Google client IDs start with GOOGLE_CLIENT_ID'])
    expect(unconfiguredProviders(settings, config, noGoogle)).toEqual([])
  })

  it("fails without the native app's bundle ID in the Apple client IDs", () => {
    expect(assertAuthConfig(settings, { ...config, external_apple_client_id: 'app.grnyte.web' }, clients)).toEqual([
      'the Apple client IDs list the native app (rocks.grnyte)',
    ])
  })

  it('finds the bundle ID in the Apple additional client IDs', () => {
    const split = {
      ...config,
      external_apple_additional_client_ids: 'rocks.grnyte',
      external_apple_client_id: 'app.grnyte.web',
    }
    expect(assertAuthConfig(settings, split, clients)).toEqual([])
  })
})

describe('assertAppleAssociation', () => {
  const app = 'TEAM123456.rocks.grnyte'
  const excludes = [
    { '/': '/auth/*', exclude: true },
    { '/': '/api/*', exclude: true },
  ]
  const includes = [{ '/': '/routes' }, { '/': '/routes/*' }]
  const file = (components: object[], apps = [app]) => ({
    applinks: { details: [{ appIDs: [app], components }] },
    webcredentials: { apps },
  })

  it('passes content links behind the /auth and /api excludes, and webcredentials naming only the app', () => {
    expect(assertAppleAssociation(file([...excludes, ...includes]))).toEqual([])
  })

  it('fails the webcredentials-only file', () => {
    expect(assertAppleAssociation({ webcredentials: { apps: [app] } })).toContain(
      'the Apple association file holds exactly applinks and webcredentials',
    )
  })

  it('fails with an exclude after an include', () => {
    expect(assertAppleAssociation(file([excludes[0], ...includes, excludes[1]]))).toEqual([
      'the Apple association file excludes /auth/* and /api/* before every include',
    ])
  })

  it('fails when it claims the whole site', () => {
    expect(assertAppleAssociation(file([...excludes, ...includes, { '/': '/*' }]))).toEqual([
      'the Apple association file claims no /*',
    ])
  })

  it('fails with a second app', () => {
    expect(assertAppleAssociation(file([...excludes, ...includes], [app, 'TEAM123456.other.app']))).toEqual([
      'the Apple association file names only rocks.grnyte',
    ])
  })
})

describe('assertAssetLinks', () => {
  const statement = (package_name: string) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name, sha256_cert_fingerprints: ['AA:BB'] },
  })

  it('passes one handle_all_urls statement for rocks.grnyte', () => {
    expect(assertAssetLinks([statement('rocks.grnyte')])).toEqual([])
  })

  it('fails for another package', () => {
    expect(assertAssetLinks([statement('com.other.app')])).toEqual([
      'the Android asset links file delegates to rocks.grnyte with a fingerprint',
    ])
  })

  it('fails without a fingerprint', () => {
    const json = [
      { ...statement('rocks.grnyte'), target: { ...statement('rocks.grnyte').target, sha256_cert_fingerprints: [] } },
    ]
    expect(assertAssetLinks(json)).toEqual([
      'the Android asset links file delegates to rocks.grnyte with a fingerprint',
    ])
  })

  it('fails with a second statement', () => {
    expect(assertAssetLinks([statement('rocks.grnyte'), statement('com.other.app')])).toEqual([
      'the Android asset links file holds one statement',
    ])
  })
})

describe('assertGotrueVersion', () => {
  // `/auth/v1/health` as the second stack answers it.
  const health = { description: 'GoTrue is a user registration and authentication API', name: 'GoTrue' }

  it('passes the tested release', () => {
    expect(assertGotrueVersion({ ...health, version: GOTRUE_CONTRACT_VERSION })).toBeNull()
  })

  it('names both versions and the runbook when hosted GoTrue moved', () => {
    expect(assertGotrueVersion({ ...health, version: 'v2.198.0' })).toBe(
      `GoTrue is v2.198.0, the contract was tested on ${GOTRUE_CONTRACT_VERSION}: see deployment/README.md "New GoTrue version"`,
    )
  })

  it('fails when the health answer carries no version', () => {
    expect(assertGotrueVersion({})).toMatch(/^GoTrue is unknown, /)
  })
})
