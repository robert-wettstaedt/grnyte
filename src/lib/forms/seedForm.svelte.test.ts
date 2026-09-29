import type { RemoteFormIssue } from '@sveltejs/kit'
import { render } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import SeedFormFixture from './SeedFormFixture.svelte'
import { seedForm } from './seedOnKeyChange.svelte'

// FormHint's motion module builds a MediaQuery at import, and jsdom has no matchMedia.
vi.hoisted(() => {
  globalThis.matchMedia = ((query: string) => ({
    addEventListener: () => {},
    matches: false,
    media: query,
    removeEventListener: () => {},
  })) as unknown as typeof matchMedia
  // jsdom has no Web Animations: finish after the duration, so an outro holds its node as a browser would.
  Element.prototype.animate = function (_keyframes, options) {
    const animation = { cancel: () => {}, currentTime: 0, onfinish: null as (() => void) | null }
    setTimeout(() => animation.onfinish?.(), typeof options === 'number' ? options : Number(options?.duration ?? 0))
    return animation as unknown as Animation
  }
})

const STALE = 'The tags changed while this was open.'
const STALE_FIELD = 'A route with this name already exists.'

// Stands in for Kit's remote form, with its `handle_reset` body verbatim: after a tick it rebuilds
// its values from the rendered FormData and clears every issue. It never reads `defaultPrevented`.
function kitForm(find: () => HTMLFormElement | null) {
  const issues: RemoteFormIssue[] = [
    { message: STALE, path: [] },
    { message: STALE_FIELD, path: ['name'] },
  ]
  const state = $state({ input: {} as Record<string, unknown>, issues })
  let listening: HTMLFormElement | null = null
  return {
    get element() {
      const element = find()
      if (element != null && element !== listening) {
        listening = element
        element.addEventListener('reset', async () => {
          await tick()
          state.input = Object.fromEntries(new FormData(element))
          state.issues = []
        })
      }
      return element
    },
    fields: { allIssues: () => state.issues, set: (values: Record<string, unknown>) => (state.input = values) },
    state,
  }
}

const alerts = () => document.querySelectorAll('[role="alert"]')

describe('seedForm', () => {
  it('drops the issues a previous open left behind', async () => {
    const { container } = render(SeedFormFixture)
    const form = kitForm(() => container.querySelector('form'))

    await seedForm(form, { name: 'seeded' })

    expect(form.state.issues).toEqual([])
  })

  it('keeps the seed over what Kit rebuilt from the rendered fields', async () => {
    const { container } = render(SeedFormFixture)
    const form = kitForm(() => container.querySelector('form'))

    // `known` is not rendered here, so Kit's FormData rebuild alone would lose it.
    await seedForm(form, { known: '3.1-abc', name: 'seeded' })

    expect(form.state.input).toEqual({ known: '3.1-abc', name: 'seeded' })
  })

  it('leaves Svelte-bound inputs alone, because the reset is cancelled', async () => {
    const { container } = render(SeedFormFixture)
    const form = kitForm(() => container.querySelector('form'))

    await seedForm(form, { name: 'seeded' })
    flushSync()

    expect(container.querySelector<HTMLInputElement>('input[name="bound"]')!.value).toBe('typed')
  })

  it('does nothing to a form that is not mounted', async () => {
    const form = kitForm(() => document.createElement('form'))

    await seedForm(form, { name: 'seeded' })

    expect(form.state.issues).toHaveLength(2)
    expect(form.state.input).toEqual({ name: 'seeded' })
  })
})

describe('issues under a reseeded form', () => {
  it('never paints a stale alert, form-level or field-level, while a reopen seeds', async () => {
    const form = kitForm(() => document.querySelector('form'))

    // Sampled at the end of the mounting task, the first moment a browser could paint, then per frame.
    render(SeedFormFixture, { form, seed: true })
    flushSync()
    const seen = [alerts().length]
    while (form.state.issues.length > 0) {
      await tick()
      seen.push(alerts().length)
    }
    await tick()
    seen.push(alerts().length)

    expect(seen.filter((count) => count > 0)).toEqual([])
  })

  it('still shows real issues once nothing is seeding', async () => {
    const form = kitForm(() => document.querySelector('form'))

    render(SeedFormFixture, { form })

    await vi.waitFor(() => expect(alerts()).toHaveLength(2))
    expect([...alerts()].map((alert) => alert.textContent)).toEqual([
      expect.stringContaining(STALE),
      expect.stringContaining(STALE_FIELD),
    ])
  })
})
