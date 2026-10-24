import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const remote = vi.hoisted(() => ({
  args: [] as unknown[],
  query: {
    current: [
      {
        actorName: 'Cy',
        createdAt: Date.now(),
        ground: 'spam',
        id: 7,
        items: [{ kind: 'area', name: 'Gym wall' }],
        objectId: '9',
        objectType: 'area',
        reason: 'Advertising a gym',
        regionName: 'North',
        reversedAt: undefined,
      },
    ],
    error: undefined,
    ready: true,
    refresh: vi.fn(async () => {}),
  },
}))
const writes = vi.hoisted(() => ({ undoRemoval: vi.fn(async () => ({})) }))

vi.mock('$app/state', () => ({
  page: { params: { regionId: '1' }, url: new URL('http://localhost/regions/1/moderation') },
}))
vi.mock('$lib/entities/moderation/moderation.remote', () => ({
  listRegionDecisions: (args: unknown) => {
    remote.args.push(args)
    return remote.query
  },
}))
vi.mock('$lib/entities/moderation/writes', () => writes)
vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({ user: { id: 3 }, userRegions: [{ permissions: ['region.delete'], regionFk: 1 }] }),
}))
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

it('lists the region s decisions without the region and undoes the row s own object', async () => {
  render(Page)

  expect(remote.args).toEqual([{ regionFk: 1 }])
  expect(screen.queryByText(/North/)).toBeNull()
  await fireEvent.click(screen.getByText('Spam or advertising'))
  await fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Undo' }))

  await waitFor(() => expect(remote.query.refresh).toHaveBeenCalled())
  expect(writes.undoRemoval).toHaveBeenCalledWith('area', '9', 7)
})
