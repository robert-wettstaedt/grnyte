/**
 * The GoTrue switches sign-up, codes and account changes depend on, as one pure
 * function so a test can feed it literal JSON. `settings` is the public `/auth/v1/settings` answer,
 * `config` the Management API's `GET /v1/projects/{ref}/config/auth`.
 */
type Json = Record<string, unknown>

/** The GoTrue release `npm run test:gotrue` last passed against; README "New GoTrue version" bumps it. */
export const GOTRUE_CONTRACT_VERSION = 'v2.197.0'

/** A failure line when hosted GoTrue (its `/auth/v1/health` answer) is not the tested release, else null. */
export function assertGotrueVersion(health: Json): null | string {
  if (health.version === GOTRUE_CONTRACT_VERSION) return null
  return `GoTrue is ${String(health.version ?? 'unknown')}, the contract was tested on ${GOTRUE_CONTRACT_VERSION}: see deployment/README.md "New GoTrue version"`
}

export const HOOK_URI = 'pg-functions://postgres/public/before_user_created_hook'
/** Supabase's own default for custom SMTP; the built-in mailer's 2 an hour would starve sign-up. */
export const MIN_EMAIL_RATE_LIMIT = 30

/** The web client of each sign-in provider, which must come first in GoTrue's client ID list. */
export interface ProviderClients {
  appleServicesId: string
  googleClientId: string
}

const firstClientId = (value: unknown) => (typeof value === 'string' ? value.split(',')[0].trim() : undefined)

/** Every expectation that does not hold, as a readable line; empty when the config is right. */
export function assertAuthConfig(settings: Json, config: Json, clients: ProviderClients): string[] {
  const external = (settings.external ?? {}) as Json
  const expectations: [unknown, string][] = [
    // Open, because the hook below refuses every sign-up without grnyte's marker.
    [
      settings.disable_signup === false && config.disable_signup === false,
      'public sign-up is open (disable_signup false)',
    ],
    [config.hook_before_user_created_enabled === true, 'the before-user-created hook is enabled'],
    [config.hook_before_user_created_uri === HOOK_URI, `the before-user-created hook points at ${HOOK_URI}`],
    [external.email === true, 'the email provider is enabled'],
    [settings.mailer_autoconfirm === false, 'email confirmation is required (mailer_autoconfirm false)'],
    [config.mailer_otp_length === 8, 'email codes have 8 digits (mailer_otp_length 8)'],
    [config.mailer_otp_exp === 600, 'email codes live 10 minutes (mailer_otp_exp 600)'],
    [config.mailer_secure_email_change_enabled === true, 'an email change needs both codes'],
    [config.security_update_password_require_reauthentication === true, 'a password change needs re-authentication'],
    [config.refresh_token_rotation_enabled === true, 'refresh tokens rotate'],
    [config.security_refresh_token_reuse_interval === 10, 'the refresh token reuse interval is 10 s'],
    [config.mailer_notifications_password_changed_enabled === true, 'the password-changed notice is on'],
    [config.mailer_notifications_email_changed_enabled === true, 'the email-changed notice is on'],
    [config.jwt_exp === 3600, 'access tokens live an hour (jwt_exp 3600)'],
    [
      typeof config.rate_limit_email_sent === 'number' && config.rate_limit_email_sent >= MIN_EMAIL_RATE_LIMIT,
      `the email rate limit is at least ${MIN_EMAIL_RATE_LIMIT} an hour`,
    ],
    [config.external_phone_enabled === false, 'phone sign-up is off'],
    [config.external_anonymous_users_enabled === false, 'anonymous sign-in is off'],
    // Sign in with Apple and Google (`add-social-sign-in` design decision 12).
    [external.apple === true && config.external_apple_enabled === true, 'the Apple provider is enabled'],
    [external.google === true && config.external_google_enabled === true, 'the Google provider is enabled'],
    [
      clients.appleServicesId !== '' && firstClientId(config.external_apple_client_id) === clients.appleServicesId,
      'the Apple client IDs start with APPLE_SERVICES_ID',
    ],
    [
      clients.googleClientId !== '' && firstClientId(config.external_google_client_id) === clients.googleClientId,
      'the Google client IDs start with GOOGLE_CLIENT_ID',
    ],
    [
      config.external_apple_skip_nonce_check === false,
      'Apple checks the nonce (external_apple_skip_nonce_check false)',
    ],
    [
      config.external_google_skip_nonce_check === false,
      'Google checks the nonce (external_google_skip_nonce_check false)',
    ],
    [config.security_manual_linking_enabled === true, 'manual linking is on (security_manual_linking_enabled)'],
    [config.mailer_notifications_identity_linked_enabled === true, 'the identity-linked notice is on'],
    [config.mailer_notifications_identity_unlinked_enabled === true, 'the identity-unlinked notice is on'],
  ]
  return expectations.filter(([ok]) => ok !== true).map(([, message]) => message)
}
