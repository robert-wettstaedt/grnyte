import { render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const state = vi.hoisted(() => ({ recipient: 9 }))

vi.mock('$app/state', () => ({
  page: {
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
vi.mock('$lib/entities/region/regions.remote', () => ({ transferRegionOwnershipCommand: vi.fn() }))
vi.mock('$lib/state/global.svelte', () => ({ getGlobalState: () => ({ user: { id: 7 }, userRegions: [] }) }))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)
vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))

beforeEach(() => {
  state.recipient = 9
})

it('names another admin as the new owner', () => {
  state.recipient = 8
  render(Page)

  expect(screen.getByText(/jonas becomes the owner of Harz/)).toBeTruthy()
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
