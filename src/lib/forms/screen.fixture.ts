/** Imported first by a screen's jsdom test: still motion, a connection, and what jsdom lacks. */
import { flushSync, tick } from 'svelte'
import { vi } from 'vitest'

vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))

const inert = { addEventListener: vi.fn(), disconnect: vi.fn(), observe: vi.fn(), removeEventListener: vi.fn() }
vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return { ...inert, unobserve: vi.fn() }
  }),
)
vi.stubGlobal('matchMedia', () => ({ ...inert, matches: false }))
Element.prototype.scrollIntoView = vi.fn()

/** Lets the mocked remotes answer and the DOM catch up. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await tick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}
