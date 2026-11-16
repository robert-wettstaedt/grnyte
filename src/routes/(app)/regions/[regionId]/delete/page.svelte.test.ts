import { confirmWithCode, enterCode, reauthRemote, resetReauthRemote } from '$lib/auth/reauth.fixture'
import { formError } from '$lib/forms/schemas'
import { settle } from '$lib/forms/screen.fixture'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const command = vi.hoisted(() => vi.fn(async (_: unknown) => {}))
const state = vi.hoisted(() => ({
  counts: { ascents: 3, members: 2 } as undefined | { ascents: number; members: number },
  failed: false,
  ownerFk: 7,
}))

vi.mock('$app/state', () => ({
  page: { data: {}, params: { regionId: '1' }, url: new URL('http://localhost/regions/1/delete') },
}))
vi.mock('$lib/entities/region/resources.svelte', () => ({
  regionDetail: () => ({
    data: { createdAt: undefined, id: 1, maxMembers: 10, name: 'Harz', owner: { id: state.ownerFk, name: 'ada' } },
    phase: { kind: 'answered' },
  }),
}))
vi.mock('$lib/entities/region/regions.remote', () => ({
  deleteRegionCommand: command,
  regionDeletionPreview: () =>
    state.failed
      ? { current: undefined, error: new Error('down'), ready: false }
      : { current: state.counts, error: undefined, ready: true },
}))
vi.mock('$lib/auth/reauth.remote', async () => (await import('$lib/auth/reauth.fixture')).reauthRemote)
vi.mock('$lib/state/global.svelte', () => ({ getGlobalState: () => ({ user: { id: 7 }, userRegions: [] }) }))
vi.mock('$lib/state/navigation.svelte', async (original) => ({ ...(await original<object>()), exit: vi.fn() }))

const submitButton = () => screen.getByRole('button', { name: 'Delete' })
const nameField = () => screen.getByLabelText('Type Harz to confirm') as HTMLInputElement

beforeEach(() => {
  state.counts = { ascents: 3, members: 2 }
  state.failed = false
  state.ownerFk = 7
  command.mockClear()
  resetReauthRemote(true)
})

it('says who loses what, then asks for the name once confirmed', async () => {
  render(Page)
  await settle()

  expect(screen.getByText('2 other members lose access and get an email.')).toBeTruthy()
  expect(screen.getByText('Their 3 ascents go too.')).toBeTruthy()
  expect(document.activeElement).toBe(nameField())
  expect(submitButton().hasAttribute('disabled')).toBe(false)
})

it('shows no name field and holds the submit until confirmed', async () => {
  resetReauthRemote(false)
  render(Page)
  await settle()

  expect(screen.queryByLabelText('Type Harz to confirm')).toBeNull()
  expect(submitButton().hasAttribute('disabled')).toBe(true)
})

it('holds the deletion while the counts are unknown', async () => {
  state.failed = true
  render(Page)
  await settle()

  expect(screen.getByRole('alert')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(true)
})

it('puts a refused name on the name field', async () => {
  command.mockRejectedValueOnce({
    body: { field: 'name', message: JSON.stringify({ message: 'region_deleteWrongName' }) },
  })
  render(Page)
  await settle()

  await fireEvent.input(nameField(), { target: { value: 'Hartz' } })
  await fireEvent.click(submitButton())

  expect(await screen.findByText('That isn’t the region’s name')).toBeTruthy()
  expect(screen.getByRole('textbox', { name: /^Type Harz to confirm/ }).getAttribute('aria-invalid')).toBe('true')
})

it('deletes nothing on a correct code, only on the submit', async () => {
  resetReauthRemote(false)
  render(Page)
  await settle()
  await confirmWithCode()

  expect(command).not.toHaveBeenCalled()
  await fireEvent.input(nameField(), { target: { value: 'Harz' } })
  await fireEvent.click(submitButton())
  await settle()
  expect(command).toHaveBeenCalledWith({ name: 'Harz', regionFk: 1 })
})

it('opens code entry on a confirmation that lapsed, keeping the typed name', async () => {
  command.mockRejectedValueOnce({ body: { field: 'code', message: formError('auth_reauthRequired') } })
  render(Page)
  await settle()
  await fireEvent.input(nameField(), { target: { value: 'Harz' } })
  await fireEvent.click(submitButton())
  await settle()

  expect(reauthRemote.requestReauthCode).toHaveBeenCalledOnce()
  await enterCode('123456')
  expect(nameField().value).toBe('Harz')
})

it('refuses anyone but the owner', () => {
  state.ownerFk = 8
  render(Page)

  expect(screen.getByText('Only the owner of this region can do that.')).toBeTruthy()
  expect(screen.queryByLabelText('Type Harz to confirm')).toBeNull()
})
