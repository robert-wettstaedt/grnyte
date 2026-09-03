import { describe, expect, it } from 'vitest'
import * as z from './zod'

/**
 * A guard on zod's own error messages.
 *
 * `zod/mini` ships no locale. Classic zod registers English as an import side effect; the mini entry
 * point does not, and without `z.config(z.locales.en())` in `./zod` every message zod produces
 * itself becomes the bare string `Invalid input`. Nothing else notices: the data, the issue codes
 * and the issue paths are all unchanged, so types pass, every other test passes, and the app ships
 * `Invalid input` on a blank name, an over-long comment and a bad URL alike.
 *
 * It is worth a test rather than trust because the failure is invisible from inside a process that
 * has also loaded classic zod: the two share one global config, so classic's side effect configures
 * mini as well. A comparison harness that imports both (the obvious way to check a migration)
 * reports no difference at all while production has none of it. That is exactly how this shipped
 * once. These assertions hold whatever else the process has loaded, which is the point.
 */
describe('zod locale', () => {
  it('is registered, so an unlabelled schema does not just say "Invalid input"', () => {
    const result = z.string().safeParse(1)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).not.toBe('Invalid input')
  })

  it.each([
    ['type', z.string(), 1, 'expected string'],
    ['enum', z.enum(['public', 'private']), 'nope', 'Invalid option'],
    ['url', z.url(), 'nope', 'Invalid URL'],
    ['minLength', z.string().check(z.minLength(3)), 'ab', 'Too small'],
    ['maxLength', z.string().check(z.maxLength(2)), 'abcd', 'Too big'],
    ['range', z.number().check(z.gte(0)), -1, 'Too small'],
  ])('names the constraint for a failing %s check', (_label, schema, input, expected) => {
    const result = schema.safeParse(input)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain(expected)
  })

  it('leaves an explicit `error` alone, which is how our own copy reaches the user', () => {
    // `formError()` payloads are resolved to paraglide keys by `resolveIssueMessage`. A locale that
    // overrode them would replace every translated message with an English sentence.
    const schema = z.string({ error: '{"message":"form_required"}' })
    const result = schema.safeParse(1)

    expect(result.error?.issues[0].message).toBe('{"message":"form_required"}')
  })
})
