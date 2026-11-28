import { exit } from '$lib/state/navigation.svelte'
import { toaster } from '$lib/state/toast/toast'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet, flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import Form from './Form.svelte'
import { formError } from './schemas'
import { createFormStore } from './store.svelte'
import * as z from './zod'

const net = $state({ online: true })
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => net.online }))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/state/navigation.svelte', () => ({ back: vi.fn(), canGoBack: () => false, exit: vi.fn() }))
// jsdom has no ResizeObserver; nothing here depends on a measured size.
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)
// jsdom has no scrollIntoView; `Form` scrolls a refusal into view.
Element.prototype.scrollIntoView = vi.fn()

async function submitOffline(online: boolean) {
  net.online = online
  const store = createFormStore(z.object({ name: z.string() }))
  const { container } = render(Form, {
    cancelTo: '/',
    children: createRawSnippet(() => ({ render: () => '<input name="name" />' })),
    initial: { name: 'Odin' },
    // `render` cannot infer the generic Input.
    store: store as never,
    submit: () => Promise.reject({ body: { message: formError('error_offline_title') }, offline: true }),
    submitLabel: 'Save',
    title: 'Edit',
  })
  const form = container.querySelector('form')!
  const input = container.querySelector('input')!
  await fireEvent.input(input, { target: { value: 'Thor' } })
  await fireEvent.submit(form)
  await vi.waitFor(() => expect(form.classList.contains('hidden') || screen.queryByRole('alert') != null).toBe(true))
  return { form, input, store }
}

describe('Form, a submit that never reached the server', () => {
  it('stays on screen with its values and says so while online', async () => {
    const { form, input, store } = await submitOffline(true)

    expect(form.classList.contains('hidden')).toBe(false)
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong on our end')
    expect(input.value).toBe('Thor')
    expect(store.fields.value()).toEqual({ name: 'Thor' })
  })

  it('shows the offline state over the form while offline, and lifts it on recovery', async () => {
    const { form, input } = await submitOffline(false)
    expect(form.classList.contains('hidden')).toBe(true)
    expect(screen.getByText('You’re offline')).toBeTruthy()

    net.online = true
    flushSync()
    expect(form.classList.contains('hidden')).toBe(false)
    expect(screen.queryByText('You’re offline')).toBeNull()
    expect(input.value).toBe('Thor')
  })
})

describe('Form, a submit kept on the device', () => {
  it('says it is saved on this device and leaves the form', async () => {
    const toast = vi.spyOn(toaster, 'create')
    const store = createFormStore(z.object({ name: z.string() }))
    const { container } = render(Form, {
      cancelTo: '/routes/5',
      children: createRawSnippet(() => ({ render: () => '<input name="name" />' })),
      initial: { name: 'Odin' },
      store: store as never,
      submit: async () => ({ queued: true }),
      submitLabel: 'Save',
      title: 'Log',
    })
    await fireEvent.submit(container.querySelector('form')!)

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith('/routes/5'))
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Saved on this device. It uploads once you’re back online.' }),
    )
  })
})
