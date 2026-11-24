import { expect, it } from 'vitest'
import { GET } from './+server'

const visit = async (query: string) =>
  GET({ url: new URL(`http://localhost/auth/confirm?${query}`) } as Parameters<typeof GET>[0])

it('sends every emailed link, with a token or without, to the expired-link page', async () => {
  for (const query of ['token_hash=abc&type=signup&next=%2Froutes%2F1', 'token_hash=abc&type=invite', '']) {
    await expect(visit(query)).rejects.toMatchObject({ location: '/auth/error', status: 303 })
  }
})
