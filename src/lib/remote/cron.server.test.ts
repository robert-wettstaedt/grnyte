import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isCronAuthorized } from './cron.server'

const env = vi.hoisted(() => ({ key: 'right-key' }))
vi.mock('$env/static/private', () => ({
  get CRON_API_KEY() {
    return env.key
  },
}))

const requestWith = (headers: Record<string, string>) => new Request('https://example.test/api/tasks', { headers })

describe('isCronAuthorized', () => {
  beforeEach(() => {
    env.key = 'right-key'
  })

  it('accepts the right key', () => {
    expect(isCronAuthorized(requestWith({ 'x-api-key': 'right-key' }))).toBe(true)
  })

  it.each([
    ['a missing header', {}],
    ['an empty header', { 'x-api-key': '' }],
    ['a wrong key of the same length', { 'x-api-key': 'wrong-key!' }],
    ['a shorter key', { 'x-api-key': 'right' }],
    ['a longer key', { 'x-api-key': 'right-key-and-more' }],
  ])('denies %s', (_, headers) => {
    expect(isCronAuthorized(requestWith(headers))).toBe(false)
  })

  it('denies everything when the secret is unset, even an empty key', () => {
    env.key = ''
    expect(isCronAuthorized(requestWith({ 'x-api-key': '' }))).toBe(false)
    expect(isCronAuthorized(requestWith({ 'x-api-key': 'right-key' }))).toBe(false)
  })
})
