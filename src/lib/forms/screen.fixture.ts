/** Imported first by a screen's jsdom test: still motion, a connection, and what jsdom lacks. */
import { render, screen } from '@testing-library/svelte'
import { flushSync, tick, type Component } from 'svelte'
import { expect, vi } from 'vitest'

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

/** The form's result outlives the page, so the step it went back from stays gone after a remount too. */
export async function expectGoBack(
  page: Component,
  form: { set: (values: Record<string, unknown>) => unknown; succeed: (value: unknown) => void },
  sent: Record<string, unknown> & { email: string },
): Promise<void> {
  const { unmount } = render(page)
  form.succeed({ ...sent, success: true })
  await settle()
  expect(screen.getByRole('heading', { name: 'Check your email' })).toBeTruthy()
  screen.getByRole('button', { name: 'Go back' }).click()
  await settle()
  expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  expect(form.set).toHaveBeenLastCalledWith({ email: sent.email })

  unmount()
  render(page)
  await settle()
  expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
}

/** Lets the mocked remotes answer and the DOM catch up. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await tick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}
