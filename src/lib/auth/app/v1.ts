/** The `/api/app/v1/` contract: shapes only widen (AGENTS.md); `v1.contract.json` holds them. */
import { IDENTITY_TARGETS, REAUTH_ACTIONS, REAUTH_TARGET_MAX } from '$lib/auth'
import * as z from '$lib/forms/zod'

export interface AppError {
  error: {
    code: string
    field?: string
    message?: string
    minVersion?: string
    params?: Record<string, unknown>
  }
}

export const APP_ERROR_CODES = {
  invalidRequest: 'invalid_request',
  methodNotAllowed: 'method_not_allowed',
  notFound: 'not_found',
  profileRequired: 'profile_required',
  rateLimited: 'auth_rateLimited',
  serviceUnavailable: 'auth_serviceUnavailable',
  sessionEnded: 'auth_sessionEnded',
  unsupportedMediaType: 'unsupported_media_type',
} as const

/** Every answer under the prefix is uncacheable, refusals included. */
export const NO_STORE = { 'cache-control': 'no-store' } as const

export function appError(status: number, error: AppError['error'], headers: Record<string, string> = {}): Response {
  return Response.json({ error } satisfies AppError, { headers: { ...NO_STORE, ...headers }, status })
}

const session = z.object({ access_token: z.string(), expires_at: z.optional(z.number()), refresh_token: z.string() })

/** A GoTrue session as the app receives it: never the user object or a provider token. */
export const appSession = ({ access_token, expires_at, refresh_token }: z.infer<typeof session>) => ({
  access_token,
  expires_at,
  refresh_token,
})

/** `{ next }` plus the session in the app's shape, only when one exists. */
export const withSession = <Next extends string>(
  next: Next,
  held: null | Parameters<typeof appSession>[0] | undefined,
) => ({
  next,
  ...(held == null ? {} : { session: appSession(held) }),
})

const ok = z.object({ ok: z.literal(true) })
/** The web twins' address rule; `email/change` keeps a plain string and checks it in its handler. */
const email = z.email()
const codeEntry = z.object({ code: z.string(), email })
const codeAnswer = z.object({
  next: z.enum(['choosePassword', 'forgotPassword', 'profile']),
  session: z.optional(session),
})
const subject = z.object({
  action: z.enum(REAUTH_ACTIONS),
  target: z.string().check(z.minLength(1), z.maxLength(REAUTH_TARGET_MAX)),
})
const providerState = z.object({ canUnlink: z.boolean(), linked: z.boolean(), relinks: z.boolean() })
const appleToken = z.object({ idToken: z.string(), rawNonce: z.string() })
const regionRef = z.object({ id: z.number(), name: z.string() })

export const V1 = {
  'account/delete': { request: z.object({}), response: ok },
  'account/deletion-preview': {
    request: z.object({}),
    response: z.object({ blocks: z.array(regionRef), deletes: z.array(regionRef) }),
  },
  challenge: {
    request: z.object({}),
    response: z.looseObject({ parameters: z.looseObject({}) }),
  },
  'email/change': { request: z.object({ email: z.string() }), response: ok },
  'email/confirm': {
    request: codeEntry,
    response: z.object({ next: z.enum(['done', 'next']), session: z.optional(session) }),
  },
  'identities/link/apple': { request: appleToken, response: z.object({ linked: z.literal(true) }) },
  'identities/unlink': {
    request: z.object({ provider: z.enum(IDENTITY_TARGETS) }),
    response: z.extend(ok, { othersSignedOut: z.boolean() }),
  },
  'oauth/apple/native': { request: appleToken, response: z.object({ session }) },
  'oauth/exchange': {
    request: z.object({ code: z.string(), codeVerifier: z.string() }),
    response: z.union([z.object({ session }), z.object({ linked: z.literal(true) })]),
  },
  'oauth/start': {
    request: z.object({
      codeChallenge: z.string(),
      codeChallengeMethod: z.enum(['S256']),
      provider: z.enum(['apple', 'google']),
      purpose: z.enum(['link', 'signin']),
      returnChannel: z.enum(['android', 'ios']),
    }),
    response: z.object({ authorizeUrl: z.string() }),
  },
  'password/change': { request: z.object({ password: z.string() }), response: z.object({ session }) },
  'password/forgot': { request: z.object({ email, proofOfWork: z.string() }), response: ok },
  'password/new': { request: z.object({ password: z.string() }), response: ok },
  'password/reset/confirm': { request: codeEntry, response: codeAnswer },
  profile: { request: z.object({ gradingScale: z.enum(['FB', 'V']), username: z.string() }), response: ok },
  'reauth/apple/confirm': {
    request: z.object({ authorizationCode: z.optional(z.string()), flowId: z.string(), idToken: z.string() }),
    response: z.object({ confirmed: z.literal(true) }),
  },
  'reauth/apple/start': { request: subject, response: z.object({ flowId: z.string(), nonce: z.string() }) },
  'reauth/confirm': {
    request: z.object({ ...subject.shape, code: z.string().check(z.maxLength(12)) }),
    response: z.object({ confirmed: z.literal(true) }),
  },
  'reauth/request': { request: subject, response: z.object({ expiresAt: z.number(), sentAt: z.number() }) },
  'reauth/status': { request: subject, response: z.object({ confirmed: z.boolean() }) },
  'sessions/sign-out-others': { request: z.object({}), response: ok },
  'sign-in-methods': {
    request: z.object({}),
    response: z.object({
      configured: z.array(z.string()),
      hasPassword: z.boolean(),
      providers: z.object({ apple: providerState, google: providerState }),
    }),
  },
  'signin/unconfirmed': {
    // As the web sign-in form: a trimmed address, not a validated one.
    request: z.object({ email: z.string().check(z.trim(), z.minLength(1)), password: z.string() }),
    response: z.union([
      z.object({ confirm: z.string(), resendToken: z.string() }),
      z.object({ alreadyConfirmed: z.literal(true) }),
    ]),
  },
  signup: {
    request: z.object({ email, password: z.string(), proofOfWork: z.string() }),
    response: z.extend(ok, { resendToken: z.string() }),
  },
  'signup/confirm': { request: codeEntry, response: codeAnswer },
  'signup/resend': {
    request: z.object({ email, proofOfWork: z.string(), resendToken: z.optional(z.string()) }),
    response: ok,
  },
}

/** Answers outside the widen-only rule: every app build handles them from its first release. */
export const V1_FIXED_ERRORS = {
  api_version_retired: z.object({ error: z.object({ code: z.literal('api_version_retired') }) }),
  app_update_required: z.object({
    error: z.object({ code: z.literal('app_update_required'), minVersion: z.string() }),
  }),
  refused_for_security: z.object({
    error: z.object({ code: z.literal('refused_for_security'), message: z.string() }),
  }),
}
