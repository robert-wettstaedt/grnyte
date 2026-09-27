import { render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import ToastFixture from './toast.fixture.svelte'

// Own file rather than a case in `toast.test.ts`: the toaster is a module singleton with `max: 3`,
// so that file's notifyError toasts would fill the queue and drop this one.
describe('toaster', () => {
  // zag writes the toast list with `flushSync`, so raising one straight from an effect used to
  // re-enter the flush and throw inside Svelte's `update_reaction`, blanking the screen.
  it('raises a toast from inside an effect without crashing the flush', async () => {
    const { container, rerender } = render(ToastFixture, { fix: undefined })

    await rerender({ fix: null })

    await vi.waitFor(() => expect(container.textContent).toContain('could not locate'))
  })
})
