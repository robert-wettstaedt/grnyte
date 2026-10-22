import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const command = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  counts: { ascents: 3, members: 2 } as undefined | { ascents: number; members: number },
  failed: false,
  ownerFk: 7,
}))

vi.mock('$app/state', () => ({
  page: { params: { regionId: '1' }, url: new URL('http://localhost/regions/1/delete') },
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
vi.mock('$lib/state/global.svelte', () => ({ getGlobalState: () => ({ user: { id: 7 }, userRegions: [] }) }))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))
// jsdom has no ResizeObserver; nothing here depends on a measured size.
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)
vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))
// The form scrolls a refused field into view, which jsdom does not implement.
Element.prototype.scrollIntoView = () => {}

const submitButton = () => screen.getByRole('button', { name: 'Delete region' })

beforeEach(() => {
  state.counts = { ascents: 3, members: 2 }
  state.failed = false
  state.ownerFk = 7
})

it('says who loses what before asking for the name and password', () => {
  render(Page)

  expect(screen.getByText('2 other members lose access and get an email.')).toBeTruthy()
  expect(screen.getByText('Their 3 ascents go too.')).toBeTruthy()
  expect(screen.getByLabelText('Type Harz to confirm')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(false)
})

it('holds the deletion while the counts are unknown', () => {
  state.failed = true
  render(Page)

  expect(screen.getByRole('alert')).toBeTruthy()
  expect(submitButton().hasAttribute('disabled')).toBe(true)
})

it('puts a refused name on the name field', async () => {
  command.mockRejectedValueOnce({
    body: { field: 'name', message: JSON.stringify({ message: 'region_deleteWrongName' }) },
  })
  render(Page)

  await fireEvent.input(screen.getByLabelText('Type Harz to confirm'), { target: { value: 'Hartz' } })
  await fireEvent.input(screen.getByLabelText('Current password'), { target: { value: 'pw' } })
  await fireEvent.click(submitButton())

  expect(await screen.findByText('That isn’t the region’s name')).toBeTruthy()
  expect(screen.getByRole('textbox', { name: /^Type Harz to confirm/ }).getAttribute('aria-invalid')).toBe('true')
})

it('refuses anyone but the owner', () => {
  state.ownerFk = 8
  render(Page)

  expect(screen.getByText('Only the owner of this region can do that.')).toBeTruthy()
  expect(screen.queryByLabelText('Type Harz to confirm')).toBeNull()
})
