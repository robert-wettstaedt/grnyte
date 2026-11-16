import { describe, expect, it } from 'vitest'
import {
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
  external_apple_client_id: 'app.grnyte.web,app.grnyte.ios',
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
      assertAuthConfig(settings, { ...config, external_apple_client_id: 'app.grnyte.ios,app.grnyte.web' }, clients),
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
