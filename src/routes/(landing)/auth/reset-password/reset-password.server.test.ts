import { expect, it } from 'vitest'
import { GET } from './+server'

it('sends the old link page to the password reset by code', async () => {
  const event = { url: new URL('http://localhost/auth/reset-password?contested=1&next=%2F') }
  await expect(async () => GET(event as Parameters<typeof GET>[0])).rejects.toMatchObject({
    location: '/auth/forgot-password',
    status: 303,
  })
})
