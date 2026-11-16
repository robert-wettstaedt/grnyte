import { settle } from '$lib/forms/screen.fixture'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const remote = vi.hoisted(() => ({
  confirmEmailChangeCode: vi.fn(async (_: { code: string; email: string }) => ({ step: 'next' as 'done' | 'next' })),
  updateEmailCommand: vi.fn(async ({ email }: { email: string }) => ({
    current: 'old@example.com',
    email,
    success: true,
  })),
}))
vi.mock('../account.remote', () => remote)

const codeFor = (email: string) => screen.queryByLabelText(`Code sent to ${email}`) as HTMLInputElement | null
const asks = (text: RegExp | string) => screen.queryByText(text)

async function enter(email: string, code: string) {
  await fireEvent.input(codeFor(email)!, { target: { value: code } })
  await settle()
}

async function startChange() {
  render(Page)
  await settle()
  await fireEvent.input(screen.getByLabelText('New email'), { target: { value: 'new@example.com' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send codes' }))
  await settle()
}

beforeEach(() => {
  remote.confirmEmailChangeCode.mockClear()
  remote.updateEmailCommand.mockClear()
})

it("asks for the current address's code first under the address, and the new address's only once that one was accepted", async () => {
  await startChange()
  expect(asks('Step 1 of 2 · Confirm it’s you')).toBeTruthy()
  expect(codeFor('old@example.com')).toBeTruthy()
  expect(codeFor('new@example.com')).toBeNull()
  expect((screen.getByLabelText('New email') as HTMLInputElement).readOnly).toBe(true)
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()

  await enter('old@example.com', '12345678')
  expect(remote.confirmEmailChangeCode).toHaveBeenCalledWith({ code: '12345678', email: 'old@example.com' })
  expect(asks('Current address confirmed.')).toBeTruthy()
  expect(codeFor('old@example.com')).toBeNull()
  expect(codeFor('new@example.com')).toBeTruthy()
})

it('returns to the first step after a resend on the second, saying both addresses got a new code', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await startChange()
  await enter('old@example.com', '12345678')
  expect(codeFor('new@example.com')).toBeTruthy()

  vi.advanceTimersByTime(61_000)
  await settle()
  await fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }))
  await settle()
  vi.useRealTimers()

  expect(remote.updateEmailCommand).toHaveBeenLastCalledWith({ email: 'new@example.com' })
  expect(asks(/Both addresses got a new code/)).toBeTruthy()
  expect(codeFor('old@example.com')).toBeTruthy()
})
