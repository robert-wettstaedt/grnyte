import { hangingFetch } from '$lib/db/secretKey.fixture'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkPassword } from './passwordPolicy.server'

// The dev server skips the check; these tests cover the built app.
vi.mock('$app/environment', () => ({ dev: false }))

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex').toUpperCase()

afterEach(() => vi.restoreAllMocks())

describe('checkPassword', () => {
  it('refuses a password the range service lists, sending only the hash prefix', async () => {
    const hash = sha1('correct horse battery')
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(`${'0'.repeat(35)}:0\r\n${hash.slice(5)}:42\r\n`))

    expect(await checkPassword('correct horse battery')).toBe('breached')
    expect(String(fetch.mock.calls[0][0])).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`)
  })

  it('passes a password whose suffix appears only as padding', async () => {
    const hash = sha1('correct horse battery')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`${hash.slice(5)}:0\r\n`))

    expect(await checkPassword('correct horse battery')).toBe('ok')
  })

  it('falls back to the bundled list when the range service does not answer in time', async () => {
    hangingFetch()

    expect(await checkPassword('password123')).toBe('breached')
  })

  it('passes an uncommon password while the range service is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    expect(await checkPassword('Vq7-unlikely-Zebra-41')).toBe('ok')
  })
})
