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

/** What `signInMethodsQuery` answers a screen test: Apple linked (and configured) or not, or failing. */
export const methods = {
  apple: false,
  canUnlink: false,
  configured: ['apple', 'google'],
  failed: false,
  google: false,
  hasPassword: true,
  relinks: false,
}

const DEFAULT_METHODS = { ...methods }

/** The identities remotes, for `vi.mock('$lib/auth/identities.remote', ...)`. */
export const identitiesRemote = {
  signInMethodsQuery: () =>
    methods.failed
      ? { current: undefined, error: new Error('down'), ready: false }
      : {
          current: {
            configured: methods.configured,
            hasPassword: methods.hasPassword,
            providers: {
              apple: { canUnlink: methods.canUnlink, linked: methods.apple, relinks: methods.relinks },
              google: { canUnlink: methods.canUnlink, linked: methods.google, relinks: methods.relinks },
            },
          },
          error: undefined,
          ready: true,
          refresh: async () => {},
        },
  unlinkProvider: vi.fn(async (_: unknown) => ({ othersSignedOut: true })),
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
  Object.assign(methods, DEFAULT_METHODS)
}

export const appleButton = () => screen.queryByRole('button', { name: 'Confirm with Apple' })

/** Submits a screen whose command answers that it needs a confirmation: code entry opens with a fresh code. */
export async function submitNeedingConfirmation(submit: HTMLElement): Promise<void> {
  await settle()
  await fireEvent.click(submit)
  await settle()
  expect(reauthRemote.requestReauthCode).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Code')).toBeTruthy()
}

/** Submits a screen of an Apple-linked account whose command needs a confirmation: back to the choice, nothing mailed. */
export async function submitNeedingConfirmationWithApple(submit: HTMLElement): Promise<void> {
  await settle()
  await fireEvent.click(submit)
  await settle()
  expect(reauthRemote.requestReauthCode).not.toHaveBeenCalled()
  expect(appleButton()).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy()
}
