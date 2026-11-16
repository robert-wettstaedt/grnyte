import {
  appleButton,
  confirmWithCode,
  methods,
  reauthRemote,
  resetReauthRemote,
  submitNeedingConfirmation,
} from '$lib/auth/reauth.fixture'
import { formError } from '$lib/forms/schemas'
import { settle } from '$lib/forms/screen.fixture'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const state = vi.hoisted(() => ({ recipient: 9 }))

vi.mock('$app/state', () => ({
  page: {
    data: {},
    get params() {
      return { regionId: '1', userId: String(state.recipient) }
    },
    url: new URL('http://localhost/regions/1/owner/9'),
  },
}))
vi.mock('$lib/entities/region/resources.svelte', () => ({
  regionDetail: () => ({
    data: { createdAt: undefined, id: 1, maxMembers: 10, name: 'Harz', owner: { id: 7, name: 'mara' } },
    phase: { empty: false, kind: 'answered' },
  }),
  regionMemberList: () => ({
    data: [
      { id: 1, invitedBy: undefined, role: 'region_admin', userId: 7, username: 'mara' },
      { id: 2, invitedBy: undefined, role: 'region_admin', userId: 8, username: 'jonas' },
      { id: 3, invitedBy: undefined, role: 'region_user', userId: 9, username: 'ada' },
    ],
    phase: { empty: false, kind: 'answered' },
  }),
}))
const command = vi.hoisted(() => vi.fn(async (_: unknown) => {}))
vi.mock('$lib/entities/region/regions.remote', () => ({ transferRegionOwnershipCommand: command }))
vi.mock('$lib/auth/reauth.remote', async () => (await import('$lib/auth/reauth.fixture')).reauthRemote)
vi.mock('$lib/auth/identities.remote', async () => (await import('$lib/auth/reauth.fixture')).identitiesRemote)
vi.mock('$lib/state/navigation.svelte', async (original) => ({ ...(await original<object>()), exit: vi.fn() }))
vi.mock('$lib/state/global.svelte', () => ({ getGlobalState: () => ({ user: { id: 7 }, userRegions: [] }) }))

const submitButton = () => screen.getByRole('button', { name: 'Hand over' })

beforeEach(() => {
  state.recipient = 9
  command.mockClear()
  resetReauthRemote(false)
})

it('hands nothing over on a correct code, only on the submit', async () => {
  state.recipient = 8
  render(Page)
  await settle()
  expect(reauthRemote.reauthGrantStatus).toHaveBeenCalledWith({ action: 'region.transfer', target: '1:8' })
  expect(submitButton().hasAttribute('disabled')).toBe(true)
  await confirmWithCode()

  expect(screen.getByText('Press Hand over to make jonas the owner.')).toBeTruthy()
  expect(command).not.toHaveBeenCalled()
  await fireEvent.click(submitButton())
  await settle()
  expect(command).toHaveBeenCalledWith({ regionFk: 1, userFk: 8 })
})

it.each([
  [true, true],
  [false, false],
])('offers Confirm with Apple only to an Apple-linked account (%s)', async (linked, shown) => {
  state.recipient = 8
  methods.apple = linked
  render(Page)
  await settle()

  expect(appleButton() != null).toBe(shown)
})

it('settles with no alternative when the sign-in methods cannot be read', async () => {
  state.recipient = 8
  methods.failed = true
  render(Page)
  await settle()

  expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy()
  expect(appleButton()).toBeNull()
})

it('opens code entry when the handover answers that it needs a confirmation', async () => {
  state.recipient = 8
  resetReauthRemote(true)
  command.mockRejectedValueOnce({ body: { field: 'code', message: formError('auth_reauthRequired') } })
  render(Page)

  await submitNeedingConfirmation(submitButton())
})

it('names another admin as the new owner', () => {
  state.recipient = 8
  render(Page)

  expect(screen.getByText(/jonas becomes the owner of Harz/)).toBeTruthy()
  expect(screen.getByText('Admin of Harz')).toBeTruthy()
})

it('refuses a member who is not an admin', () => {
  render(Page)

  expect(screen.getByText('Only an admin can become the owner. Make them an admin first.')).toBeTruthy()
})

it('says the member is gone and leads back to the region, for someone not in it', () => {
  state.recipient = 99
  render(Page)

  expect(screen.getByText('Member not found')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View region' }).getAttribute('href')).toBe('/regions/1')
})
