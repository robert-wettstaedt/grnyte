/** The `/api/app/v1/` contract: shapes only widen (AGENTS.md); `v1.contract.json` holds them. */
import { IDENTITY_TARGETS, REAUTH_ACTIONS } from '$lib/auth'
import * as z from '$lib/forms/zod'

/** The one error shape under the prefix, whatever refused. */
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
  rateLimited: 'auth_rateLimited',
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

const ok = z.object({ ok: z.literal(true) })
const codeEntry = z.object({ code: z.string(), email: z.string() })
const codeAnswer = z.object({
  next: z.enum(['choosePassword', 'forgotPassword', 'profile']),
  session: z.optional(session),
})
const subject = z.object({ action: z.enum(REAUTH_ACTIONS), target: z.string() })
const providerState = z.object({ canUnlink: z.boolean(), linked: z.boolean(), relinks: z.boolean() })
const regionRef = z.object({ id: z.number(), name: z.string() })

/** Each endpoint's request and response shape, by path under `/api/app/v1/`. Values are checked by the shared bodies. */
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
    response: z.object({ refreshRequired: z.optional(z.boolean()), step: z.enum(['done', 'next']) }),
  },
  'identities/unlink': {
    request: z.object({ provider: z.enum(IDENTITY_TARGETS) }),
    response: z.object({ ok: z.literal(true), othersSignedOut: z.boolean() }),
  },
  'password/change': { request: z.object({ password: z.string() }), response: z.object({ session }) },
  'password/forgot': { request: z.object({ email: z.string(), proofOfWork: z.string() }), response: ok },
  'password/new': { request: z.object({ password: z.string() }), response: ok },
  'password/reset/confirm': { request: codeEntry, response: codeAnswer },
  profile: { request: z.object({ gradingScale: z.enum(['FB', 'V']), username: z.string() }), response: ok },
  'reauth/confirm': {
    request: z.object({ ...subject.shape, code: z.string() }),
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
    request: z.object({ email: z.string(), password: z.string() }),
    response: z.union([
      z.object({ confirm: z.string(), resendToken: z.string() }),
      z.object({ alreadyConfirmed: z.literal(true) }),
    ]),
  },
  signup: {
    request: z.object({ email: z.string(), password: z.string(), proofOfWork: z.string() }),
    response: z.object({ ok: z.literal(true), resendToken: z.string() }),
  },
  'signup/confirm': { request: codeEntry, response: codeAnswer },
  'signup/resend': {
    request: z.object({ email: z.string(), proofOfWork: z.string(), resendToken: z.optional(z.string()) }),
    response: ok,
  },
}

/** Answers outside the widen-only rule: every app build handles them from its first release (design decision 1). */
export const V1_FIXED_ERRORS = {
  api_version_retired: z.object({ error: z.object({ code: z.literal('api_version_retired') }) }),
  app_update_required: z.object({
    error: z.object({ code: z.literal('app_update_required'), minVersion: z.string() }),
  }),
  refused_for_security: z.object({
    error: z.object({ code: z.literal('refused_for_security'), message: z.string() }),
  }),
}
