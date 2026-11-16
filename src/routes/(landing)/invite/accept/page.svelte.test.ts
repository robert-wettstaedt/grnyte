import '$lib/forms/screen.fixture'
import { setLocale } from '$lib/paraglide/runtime'
import { render } from '@testing-library/svelte'
import { expect, it, onTestFinished, vi } from 'vitest'
import Page from './+page.svelte'

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/invite/accept?token=t') } }))
vi.mock('$lib/auth/session.remote', () => ({
  signOut: {
    enhance: () => ({ action: '', method: 'POST' }),
    fields: { redirectTo: { as: (type: string, value: string) => ({ name: 'redirectTo', type, value }) } },
  },
}))
vi.mock('$lib/entities/region/regions.remote', () => ({ acceptRegionInvitation: vi.fn() }))
vi.mock('$lib/state/pwa/wipe', () => ({ wipeAndLeave: vi.fn() }))

const bold = () => [...document.querySelectorAll('b')].map((node) => node.textContent)

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
  expect(bold()).toEqual(['other@example.test', 'invitee@example.test', 'Ana'])
})

it('says it in German, bold where the board has it', () => {
  setLocale('de', { reload: false })
  onTestFinished(() => setLocale('en', { reload: false }))
  render(Page, wrongAccount(null))
  expect(document.body.textContent).toContain(
    'Du bist angemeldet als other@example.test. Diese Einladung ist für invitee@example.test. Mach mit dieser E-Mail weiter, oder bitte eine:n Admin von Harz, die Adresse einzuladen, die du nutzt.',
  )
  expect(bold()).toEqual(['other@example.test', 'invitee@example.test', 'eine:n Admin von Harz'])
})

it("names the region's admins when the inviter is gone", () => {
  render(Page, wrongAccount(null))
  expect(document.body.textContent).toContain('This invite is for invitee@example.test.')
  expect(document.body.textContent).toContain('ask an admin of Harz to invite')
  expect(bold()).toContain('an admin of Harz')
})
