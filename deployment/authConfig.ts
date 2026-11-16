/**
 * The GoTrue switches sign-up, codes and account changes depend on (design decision 15), as one pure
 * function so a test can feed it literal JSON. `settings` is the public `/auth/v1/settings` answer,
 * `config` the Management API's `GET /v1/projects/{ref}/config/auth`.
 */
type Json = Record<string, unknown>

export const HOOK_URI = 'pg-functions://postgres/public/before_user_created_hook'
/** Supabase's own default for custom SMTP; the built-in mailer's 2 an hour would starve sign-up. */
export const MIN_EMAIL_RATE_LIMIT = 30

/** Every expectation that does not hold, as a readable line; empty when the config is right. */
export function assertAuthConfig(settings: Json, config: Json): string[] {
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
  ]
  return expectations.filter(([ok]) => ok !== true).map(([, message]) => message)
}
