/**
 * `sendEmailOutcome` tells a failure worth retrying from one that will fail again; `sendEmail`
 * still answers only whether the mail went out.
 */
import { describe, expect, it, vi } from 'vitest'
import { sendEmail, sendEmailOutcome } from './send.server'

let answer: null | { message: string; name: string } = null
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async () => ({ data: null, error: answer }) }
  },
}))
const logged: string[] = []
vi.mock('$lib/logging/failure.server', () => ({
  logServerFailure: async (_source: string, message: string) => {
    logged.push(message)
  },
}))
vi.mock('./shell', () => ({ renderEmailHtml: () => '', renderEmailText: () => '' }))
// Set here, not inherited: an unset key answers `failed` before the client is ever asked.
vi.mock('$env/static/private', () => ({ RESEND_API_KEY: 're_test', RESEND_SENDER_EMAIL: 'from@example.test' }))

const mail = { subject: 's', template: 't', to: 'x@example.test' } as never

describe('sendEmailOutcome', () => {
  it.each([
    [null, 'sent'],
    ['rate_limit_exceeded', 'retry'],
    ['application_error', 'retry'],
    ['internal_server_error', 'retry'],
    ['validation_error', 'failed'],
    ['invalid_from_address', 'failed'],
  ])('answers %s with %s', async (name, outcome) => {
    answer = name == null ? null : { message: 'm', name }
    expect(await sendEmailOutcome(mail)).toBe(outcome)
  })

  it('leaves a retry unlogged under quietRetry, never a failure', async () => {
    logged.length = 0
    answer = { message: 'm', name: 'rate_limit_exceeded' }
    expect(await sendEmailOutcome(mail, { quietRetry: true })).toBe('retry')
    expect(logged).toEqual([])
    answer = { message: 'm', name: 'validation_error' }
    expect(await sendEmailOutcome(mail, { quietRetry: true })).toBe('failed')
    expect(logged).toHaveLength(1)
  })

  it('keeps sendEmail a plain whether-it-went-out', async () => {
    answer = { message: 'm', name: 'rate_limit_exceeded' }
    expect(await sendEmail(mail)).toBe(false)
    answer = null
    expect(await sendEmail(mail)).toBe(true)
  })
})
