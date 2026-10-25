import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const writes = vi.hoisted(() => ({ fileReport: vi.fn(async () => ({})) }))
const toast = vi.hoisted(() => ({ create: vi.fn() }))
const mine = vi.hoisted(() => ({
  report: undefined as undefined | { ground: string; id: number; note: null | string },
}))

vi.mock('$app/state', () => ({
  page: { params: { id: '5', kind: 'route' }, url: new URL('http://localhost/report/route/5') },
}))
vi.mock('$app/navigation', () => ({ afterNavigate: () => {}, beforeNavigate: () => {}, goto: async () => {} }))
vi.mock('$lib/entities/report/reports.remote', () => ({
  reportPreview: () => ({
    current: { body: 'Gym ad', home: '/blocks/2', href: '/routes/5', title: 'Odin' },
    error: undefined,
    ready: true,
  }),
}))
vi.mock('$lib/entities/report/resources.svelte', () => ({
  myOpenReport: () => ({ data: mine.report, phase: { empty: mine.report == null, kind: 'answered' } }),
}))
vi.mock('$lib/entities/report/writes', () => writes)
vi.mock('$lib/state/toast', async (original) => ({
  ...(await original<typeof import('$lib/state/toast')>()),
  toaster: toast,
}))
vi.mock('$lib/components/Markdown/Markdown.svelte', () => ({ default: () => {} }))
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
Element.prototype.scrollIntoView = () => {}

const legalLink = () => screen.queryByRole('link', { name: /How to report unlawful content/ })

beforeEach(() => {
  mine.report = undefined
  writes.fileReport.mockClear()
  toast.create.mockClear()
})

it('shows what is reported, and sends a spam report without a note', async () => {
  render(Page)

  expect(screen.getByText('Odin')).toBeTruthy()
  await fireEvent.click(screen.getByLabelText('Spam or advertising'))
  await fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

  await vi.waitFor(() => expect(toast.create).toHaveBeenCalled())
  expect(writes.fileReport).toHaveBeenCalledWith(expect.objectContaining({ ground: 'spam', id: '5', kind: 'route' }))
})

it('points a legal claim at the operator too, with the content s address', async () => {
  render(Page)

  expect(legalLink()).toBeNull()
  await fireEvent.click(screen.getByLabelText('Someone’s personal data, or a photo without consent'))

  expect(legalLink()?.getAttribute('href')).toBe('/legal/report?content=http%3A%2F%2Flocalhost%2Froutes%2F5')
})

it('reopens an open report with what was sent', () => {
  mine.report = { ground: 'harassment', id: 3, note: 'Names a person' }
  render(Page)

  expect((screen.getByLabelText('Harassment or threats') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByRole('textbox', { name: /^Note/ }) as HTMLTextAreaElement).value).toBe('Names a person')
  expect(screen.getByRole('button', { name: 'Update report' })).toBeTruthy()
})
