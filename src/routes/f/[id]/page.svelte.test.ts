import { render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import Page from './+page.svelte'

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/f/abc') } }))
vi.mock('$lib/components/Media/MediaStage.svelte', () => ({ default: () => {} }))
vi.mock('$lib/components/Toaster/Toaster.svelte', () => ({ default: () => {} }))
vi.mock('$lib/entities/file/files.remote', () => ({ deleteFile: vi.fn(), setFileVisibility: vi.fn() }))
// Read at import time, before a plain stub would run.
vi.hoisted(() => {
  window.matchMedia = (() => ({ addEventListener() {}, matches: false, removeEventListener() {} })) as never
})

const data = (legalReport: boolean) =>
  ({
    controls: null,
    file: { bunnyStreamFk: null, id: 'abc', path: '/a.jpg', route: undefined },
    grades: [],
    gradingScale: 'FB',
    legalReport,
    user: undefined,
  }) as never

it('offers someone outside the region the legal channel, with this page s address', () => {
  render(Page, { data: data(true) })

  expect(screen.getByRole('link', { name: 'Report' }).getAttribute('href')).toBe(
    '/legal/report?content=http%3A%2F%2Flocalhost%2Ff%2Fabc',
  )
})

it('offers a member no such link', () => {
  render(Page, { data: data(false) })

  expect(screen.queryByRole('link', { name: 'Report' })).toBeNull()
})
