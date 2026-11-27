import { flushSync } from 'svelte'
import { afterEach, expect, it, vi } from 'vitest'
import { createShare } from './clipboard.svelte'

afterEach(() => vi.unstubAllGlobals())

const mount = (canShare?: (data: ShareData) => boolean) => {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { canShare, clipboard: { writeText }, share: vi.fn(async () => {}) })
  let share!: ReturnType<typeof createShare>
  const stop = $effect.root(() => {
    share = createShare(
      () => 'Route',
      () => 'https://example.test/f/1',
    )
  })
  flushSync()
  return { share, stop, writeText }
}

it('offers no share sheet where the platform cannot share, and copies the link instead', async () => {
  const { share, stop, writeText } = mount()

  expect(share.canShare).toBe(false)
  await share.copy()
  expect(writeText).toHaveBeenCalledWith('https://example.test/f/1')
  expect(share.copied).toBe(true)
  stop()
})

it('offers the share sheet with the text and link where the platform can share them', () => {
  const canShare = vi.fn(() => true)
  const { share, stop } = mount(canShare)

  expect(share.canShare).toBe(true)
  expect(canShare).toHaveBeenCalledWith(expect.objectContaining({ text: 'Route', url: 'https://example.test/f/1' }))
  stop()
})
