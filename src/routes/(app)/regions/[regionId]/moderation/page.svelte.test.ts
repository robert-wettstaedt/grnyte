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
const reports = vi.hoisted(() => ({
  dismissReports: vi.fn(async () => ({})),
  query: {
    current: [] as unknown[],
    error: undefined,
    ready: true,
    refresh: vi.fn(async () => {}),
  },
}))
const odin = {
  grounds: ['harassment', 'unlawful'],
  href: '/routes/5',
  id: '5',
  kind: 'route',
  name: 'Odin',
  newestAt: Date.now(),
  reports: [
    { createdAt: Date.now(), ground: 'harassment', note: 'Names a person', reporterName: 'Bo' },
    { createdAt: Date.now(), ground: 'harassment', note: undefined, reporterName: 'Cy' },
    { createdAt: Date.now(), ground: 'unlawful', note: undefined, reporterName: 'Dee' },
  ],
}

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
vi.mock('$lib/entities/report/reports.remote', () => ({ listRegionReports: () => reports.query }))
vi.mock('$lib/entities/report/writes', () => ({ dismissReports: reports.dismissReports }))
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

it('says when nothing is reported', () => {
  reports.query.current = []
  render(Page)

  expect(screen.getByText('No open reports.')).toBeTruthy()
})

it('shows one row per reported object, with each reporter and their note', async () => {
  reports.query.current = [odin]
  render(Page)

  await fireEvent.click(screen.getByText('Odin'))

  expect(screen.getByText('Names a person')).toBeTruthy()
  expect(screen.getByText('Dee')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Remove…' }).getAttribute('href')).toBe(
    '/remove/route/5?ground=harassment&return=%2Fregions%2F1%2Fmoderation',
  )
})

it('dismisses after confirming, and reloads the queue', async () => {
  reports.query.current = [odin]
  render(Page)
  reports.query.refresh.mockClear()

  await fireEvent.click(screen.getByText('Odin'))
  await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  await fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dismiss' }))

  await waitFor(() => expect(reports.query.refresh).toHaveBeenCalled())
  expect(reports.dismissReports).toHaveBeenCalledWith('route', '5')
})

it('shows a sole admin their own reported content with the rules named and nothing that could point to a reporter', async () => {
  reports.query.current = [{ ...odin, newestAt: undefined, own: true, reports: [] }]
  render(Page)

  await fireEvent.click(screen.getByText('Odin'))

  expect(screen.getByText(/You added this, and no other admin can review it/)).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Remove…' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  expect(screen.queryByText('Names a person')).toBeNull()
})

// A removal opened from the queue comes back here; a cached read would still list what it removed.
it('reloads the queue and the log whenever the screen opens', () => {
  reports.query.refresh.mockClear()
  remote.query.refresh.mockClear()
  render(Page)

  expect(reports.query.refresh).toHaveBeenCalled()
  expect(remote.query.refresh).toHaveBeenCalled()
})

it('leaves a first visit to its own fetch', () => {
  reports.query.refresh.mockClear()
  reports.query.current = undefined as never
  render(Page)

  expect(reports.query.refresh).not.toHaveBeenCalled()
  reports.query.current = []
})
