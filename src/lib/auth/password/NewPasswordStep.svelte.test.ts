import '$lib/forms/screen.fixture'
import { isOnline } from '$lib/state/online.svelte'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import NewPasswordStep from './NewPasswordStep.svelte'

vi.mock('$lib/auth/password/password.remote', () => ({ setNewPassword: vi.fn() }))

it('says so when the submit could not reach the server offline', async () => {
  vi.mocked(isOnline).mockReturnValue(false)
  const ondone = vi.fn()
  render(NewPasswordStep, { ondone, submitLabel: 'Save' })
  await fireEvent.input(screen.getByLabelText('New password'), { target: { value: 'a long enough passphrase 42' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toContain('You’re offline'))
  expect(ondone).not.toHaveBeenCalled()
})
