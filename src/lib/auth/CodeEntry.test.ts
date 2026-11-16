import { formError } from '$lib/forms/schemas'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './CodeEntryFixture.svelte'

vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))

const T0 = new Date('2026-11-15T10:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

function setup(length: 6 | 8 = 8, onsubmit = vi.fn(async () => {}), onresend = vi.fn(async () => {})) {
  const onformsubmit = vi.fn()
  render(Fixture, {
    expiresAt: T0 + 10 * 60_000,
    label: 'Code',
    length,
    onformsubmit,
    onresend,
    onsubmit,
    sentAt: T0,
  })
  const input = screen.getByLabelText('Code') as HTMLInputElement
  const type = (value: string) => fireEvent.input(input, { target: { value } })
  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms)
    flushSync()
  }
  return { advance, input, onformsubmit, onresend, onsubmit, type }
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement

it('calls nothing for 7 of 8 digits and onsubmit once on the 8th', async () => {
  let finish = () => {}
  const onsubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
  const { type } = setup(8, onsubmit)
  await type('1234567')
  expect(onsubmit).not.toHaveBeenCalled()

  await type('12345678')
  await type('12345678')
  expect(onsubmit).toHaveBeenCalledOnce()
  expect(onsubmit).toHaveBeenCalledWith('12345678')
  finish()
})

it('submits on the 6th digit with length 6, and names the length', async () => {
  const { onsubmit, type } = setup(6)
  expect(screen.getByText('Enter the 6-digit code')).toBeTruthy()
  await type('123456')

  expect(onsubmit).toHaveBeenCalledWith('123456')
})

it('names the 8-digit length', () => {
  setup(8)
  expect(screen.getByText('Enter the 8-digit code')).toBeTruthy()
})

it('counts the resend down from 60 outside any live region, and announces once when it is available', () => {
  const { advance } = setup()
  const countdown = screen.getByText('Resend code in 1:00')
  expect(countdown.closest('[aria-live],[role="alert"]')).toBeNull()
  const live = document.querySelector('[aria-live="polite"]')!
  expect(live.textContent).toBe('')

  advance(1000)
  expect(screen.getByText('Resend code in 0:59')).toBeTruthy()
  advance(59_000)
  expect(live.textContent).toBe('You can request a new code now.')
})

it('shows the expired state past expiresAt', () => {
  const { advance } = setup()
  advance(10 * 60_000)

  expect(screen.getByText('This code has expired. Request a new one.')).toBeTruthy()
})

it('submits a pasted code that fired no input event once on Continue', async () => {
  const { input, onsubmit } = setup()
  input.value = '87654321'
  await fireEvent.click(continueButton())

  expect(onsubmit).toHaveBeenCalledOnce()
  expect(onsubmit).toHaveBeenCalledWith('87654321')
})

it('shows the length line and sends nothing on Continue with too few digits', async () => {
  const { onsubmit, type } = setup()
  await type('123')
  await fireEvent.click(continueButton())

  expect(onsubmit).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('Enter the 8-digit code')
})

it('disables Continue with a spinner and makes the field read-only while onsubmit runs', async () => {
  const { input, type } = setup(
    8,
    vi.fn(() => new Promise<void>(() => {})),
  )
  await type('12345678')

  expect(continueButton().disabled).toBe(true)
  expect(continueButton().querySelector('[role="progressbar"],svg,.progress')).toBeTruthy()
  expect(input.readOnly).toBe(true)
})

it('keeps focus on a wrong code with its digits selected and the error in a live line', async () => {
  const onsubmit = vi.fn(async () => {
    throw { body: { message: formError('auth_codeWrong') } }
  })
  const { input, type } = setup(8, onsubmit)
  await type('12345678')
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()

  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 8])
  expect(screen.getByRole('alert').textContent).toContain('That code is wrong')
})

it('flips Resend to "Code sent" and restarts the countdown at the press, and rolls both back on failure', async () => {
  let fail = (_: unknown) => {}
  const onresend = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)))
  const { advance } = setup(8, undefined, onresend)
  advance(60_000)
  await fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))

  expect(screen.getByText('Code sent · Resend code in 1:00')).toBeTruthy()
  fail({ body: { message: formError('auth_mailUnavailable') } })
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()

  expect(screen.getByRole('button', { name: 'Resend code' })).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('couldn’t send the mail')
})

it('never submits the surrounding form from Continue or Resend', async () => {
  const { advance, onformsubmit, type } = setup()
  await type('12345678')
  await fireEvent.click(continueButton())
  advance(60_000)
  await fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))

  expect(onformsubmit).not.toHaveBeenCalled()
})
