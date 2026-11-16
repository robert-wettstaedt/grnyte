import { enterCode } from '$lib/auth/reauth.fixture'
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

const codeField = () => screen.queryByLabelText('Code')
const asks = (text: RegExp) => screen.queryByText(text)

async function startChange() {
  render(Page)
  await settle()
  await fireEvent.input(screen.getByLabelText('New email'), { target: { value: 'new@example.com' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await settle()
}

beforeEach(() => {
  remote.confirmEmailChangeCode.mockClear()
  remote.updateEmailCommand.mockClear()
})

it("asks for the current address's code first, and the new address's only once that one was accepted", async () => {
  await startChange()
  expect(asks(/current address, old@example\.com/)).toBeTruthy()
  expect(asks(/sent to new@example\.com/)).toBeNull()
  expect(codeField()).toBeTruthy()

  await enterCode('12345678')
  expect(remote.confirmEmailChangeCode).toHaveBeenCalledWith({ code: '12345678', email: 'old@example.com' })
  expect(asks(/current address/)).toBeNull()
  expect(asks(/sent to new@example\.com/)).toBeTruthy()
  expect(screen.getAllByLabelText('Code')).toHaveLength(1)
})

it('returns to the first step after a resend on the second, saying both addresses got a new code', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await startChange()
  await enterCode('12345678')
  expect(asks(/sent to new@example\.com/)).toBeTruthy()

  vi.advanceTimersByTime(61_000)
  await settle()
  await fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
  await settle()
  vi.useRealTimers()

  expect(remote.updateEmailCommand).toHaveBeenLastCalledWith({ email: 'new@example.com' })
  expect(asks(/Both addresses got a new code/)).toBeTruthy()
  expect(asks(/current address, old@example\.com/)).toBeTruthy()
})
