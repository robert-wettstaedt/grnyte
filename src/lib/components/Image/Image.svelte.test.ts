import { render } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Image from './Image.svelte'

// Connectivity is stubbed rather than driven through the real module: its `online` event starts a
// reachability probe, which in jsdom is a fetch that fails and latches the flag back to false, so a
// test that dispatched events would decide the branch of the test after it.
let online = true
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => online }))

// jsdom never fetches, so the `<img>` neither loads nor errors on its own: the tests fire the DOM
// event the component listens for.
const img = (container: HTMLElement) => container.querySelector('img')!
const fail = (container: HTMLElement) => {
  img(container).dispatchEvent(new Event('error'))
  flushSync()
}
const icon = (container: HTMLElement, name: string) => container.querySelector(`.lucide-${name}`)

beforeEach(() => (online = true))

describe('Image failure', () => {
  it('names a missing file as missing', () => {
    const { container } = render(Image, { alt: 'Topo', path: '/topos/1.jpg', previewWidth: 256 })

    fail(container)

    expect(icon(container, 'image-off')).not.toBeNull()
  })

  it('names a failure offline as offline, not as a missing file', () => {
    online = false
    const { container } = render(Image, { alt: 'Topo', path: '/topos/1.jpg', previewWidth: 256 })

    fail(container)

    expect(icon(container, 'wifi-off')).not.toBeNull()
    expect(icon(container, 'image-off')).toBeNull()
  })

  it('falls back to the smaller derivative offline, once', () => {
    online = false
    const { container } = render(Image, { alt: 'Topo', path: '/topos/1.jpg', previewWidth: 1024 })
    expect(img(container).getAttribute('src')).toContain('w=1024')

    fail(container)
    expect(img(container).getAttribute('src')).toContain('w=256')
    expect(icon(container, 'wifi-off')).toBeNull()

    fail(container)
    expect(icon(container, 'wifi-off')).not.toBeNull()
  })

  // Stepping down online would pin the session to the thumbnail with no way back: the full size is
  // the request the `online` retry can repeat.
  it('keeps the full size when a request fails online', () => {
    const { container } = render(Image, { alt: 'Topo', path: '/topos/1.jpg', previewWidth: 1024 })

    fail(container)

    expect(img(container).getAttribute('src')).toContain('w=1024')
    expect(icon(container, 'image-off')).not.toBeNull()
  })

  // A `{#key path}` remount hands the next image whatever the previous one left on the binding, and
  // the placeholder renders off that same value.
  it('clears a failure left by a previous image at mount', () => {
    const { container } = render(Image, { alt: 'Topo', failure: 'offline', path: '/topos/2.jpg' })

    expect(icon(container, 'wifi-off')).toBeNull()
    expect(icon(container, 'image-off')).toBeNull()
  })
})
