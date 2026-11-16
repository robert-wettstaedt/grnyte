import { command, query } from '$app/server'
import { REAUTH_ACTIONS, REAUTH_TARGET_MAX } from '$lib/auth'
import * as z from '$lib/forms/zod'
import * as body from './reauthSteps.server'

const subject = z.object({
  action: z.enum(REAUTH_ACTIONS),
  target: z.string().check(z.minLength(1), z.maxLength(REAUTH_TARGET_MAX)),
})

export const requestReauthCode = command(subject, body.requestReauthCode)

export const confirmReauthCode = command(
  z.object({ ...subject.shape, code: z.string().check(z.maxLength(12)) }),
  body.confirmReauthCode,
)

export const reauthGrantStatus = query(subject, body.reauthGrantStatus)
