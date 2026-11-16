import '$lib/forms/screen.fixture'
import { render } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import Page from './+page.svelte'

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/invite/accept?token=t') } }))
vi.mock('$lib/auth/session.remote', () => ({
  signOut: {
    enhance: () => ({ action: '', method: 'POST' }),
    fields: { redirectTo: { as: (type: string, value: string) => ({ name: 'redirectTo', type, value }) } },
  },
}))
vi.mock('$lib/entities/region/regions.remote', () => ({ acceptRegionInvitation: vi.fn() }))
vi.mock('$lib/state/wipe', () => ({ wipeAndLeave: vi.fn() }))

const wrongAccount = (inviter: null | string) =>
  ({
    data: {
      inviteEmail: 'invitee@example.test',
      inviter,
      regionName: 'Harz',
      sessionEmail: 'other@example.test',
      state: 'wrongAccount',
    },
    form: undefined,
    params: {},
  }) as never

it('names the inviter on an address mismatch', () => {
  render(Page, wrongAccount('Ana'))
  expect(document.body.textContent).toContain(
    'You’re signed in as other@example.test. This invite is for invitee@example.test.',
  )
  expect(document.body.textContent).toContain('ask Ana to invite')
})

it("names the region's admins when the inviter is gone", () => {
  render(Page, wrongAccount(null))
  expect(document.body.textContent).toContain('This invite is for invitee@example.test.')
  expect(document.body.textContent).toContain('ask an admin of Harz to invite')
})
