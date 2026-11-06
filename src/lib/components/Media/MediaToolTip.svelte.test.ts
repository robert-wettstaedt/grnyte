import { render } from '@testing-library/svelte'
import { createRawSnippet, flushSync } from 'svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import MediaToolTip from './MediaToolTip.svelte'

beforeEach(() => {
  // jsdom has no ResizeObserver; nothing here depends on a measured size.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  )
  // jsdom has no matchMedia; this is the hover-capable branch.
  window.matchMedia = vi.fn(() => ({
    addEventListener: () => {},
    matches: true,
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})

const children = createRawSnippet(() => ({ render: () => '<button type="button">Tool</button>' }))
const mount = () => render(MediaToolTip, { children, key: 'M', label: 'Mute' })
const waitForOpen = (tip: HTMLElement) => vi.waitFor(() => expect(tip).toBeVisible(), { timeout: 1500 })

it('shows the name and shortcut on hover, and only then', async () => {
  const { container, getByText } = mount()
  const tip = getByText('Mute')
  expect(tip).not.toBeVisible()

  container
    .querySelector('button')!
    .dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))
  flushSync()

  await waitForOpen(tip)
  expect(getByText('M')).toBeVisible()
})

it('shows the name and shortcut for keyboard focus, and only then', async () => {
  const { container, getByText } = mount()
  const tip = getByText('Mute')
  expect(tip).not.toBeVisible()

  // Zag only opens on focus-visible, which it derives from the last modality.
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
  container.querySelector('button')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  flushSync()

  await waitForOpen(tip)
})
