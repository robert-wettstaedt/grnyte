import { describe, expect, it } from 'vitest'
import { assertAuthConfig, HOOK_URI } from './authConfig'

const settings = { disable_signup: false, external: { email: true }, mailer_autoconfirm: false }
const config = {
  disable_signup: false,
  external_anonymous_users_enabled: false,
  external_phone_enabled: false,
  hook_before_user_created_enabled: true,
  hook_before_user_created_uri: HOOK_URI,
  jwt_exp: 3600,
  mailer_notifications_email_changed_enabled: true,
  mailer_notifications_password_changed_enabled: true,
  mailer_otp_exp: 600,
  mailer_otp_length: 8,
  mailer_secure_email_change_enabled: true,
  rate_limit_email_sent: 30,
  refresh_token_rotation_enabled: true,
  security_refresh_token_reuse_interval: 10,
  security_update_password_require_reauthentication: true,
}

describe('assertAuthConfig', () => {
  it('passes a complete config', () => {
    expect(assertAuthConfig(settings, config)).toEqual([])
  })

  it('fails with the hook off', () => {
    expect(assertAuthConfig(settings, { ...config, hook_before_user_created_enabled: false })).toEqual([
      'the before-user-created hook is enabled',
    ])
  })

  it('fails with 6-digit codes', () => {
    expect(assertAuthConfig(settings, { ...config, mailer_otp_length: 6 })).toEqual([
      'email codes have 8 digits (mailer_otp_length 8)',
    ])
  })
})
