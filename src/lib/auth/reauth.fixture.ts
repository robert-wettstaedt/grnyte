import { settle } from '$lib/forms/screen.fixture'
/** Shared by the tests of the re-auth step and the screens that use it. */
import { fireEvent, screen } from '@testing-library/svelte'
import { expect, vi } from 'vitest'

/** The re-auth remotes, for `vi.mock('$lib/auth/reauth.remote', ...)`. */
export const reauthRemote = {
  confirmReauthCode: vi.fn(async (_: unknown) => ({ confirmed: true })),
  reauthGrantStatus: vi.fn(async (_: unknown): Promise<boolean> => false),
  requestReauthCode: vi.fn(async (_: unknown) => ({ expiresAt: Date.now() + 600_000, sentAt: Date.now() })),
}

export async function confirmWithCode(code = '123456'): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await settle()
  await enterCode(code)
}

export async function enterCode(code: string): Promise<void> {
  await fireEvent.input(screen.getByLabelText('Code'), { target: { value: code } })
  await settle()
}

/** Clears the calls; the peek answers `granted`. */
export function resetReauthRemote(granted: boolean): void {
  for (const fn of Object.values(reauthRemote)) fn.mockClear()
  reauthRemote.reauthGrantStatus.mockImplementation(async () => granted)
}

/** Submits a screen whose command answers that it needs a confirmation: code entry opens with a fresh code. */
export async function submitNeedingConfirmation(submit: HTMLElement): Promise<void> {
  await settle()
  await fireEvent.click(submit)
  await settle()
  expect(reauthRemote.requestReauthCode).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Code')).toBeTruthy()
}
