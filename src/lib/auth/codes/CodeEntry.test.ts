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

function setup(
  length: 6 | 8 = 8,
  onsubmit = vi.fn(async () => {}),
  onresend = vi.fn(async () => {}),
  props: Record<string, unknown> = {},
) {
  const onformsubmit = vi.fn()
  render(Fixture, {
    expiresAt: T0 + 10 * 60_000,
    label: 'Code',
    length,
    onformsubmit,
    onresend,
    onsubmit,
    sentAt: T0,
    ...props,
  })
  const input = screen.getByLabelText('Code') as HTMLInputElement
  const type = (value: string) => fireEvent.input(input, { target: { value } })
  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms)
    flushSync()
  }
  return { advance, input, onformsubmit, onresend, onsubmit, type }
}

const continueButton = () => screen.getByRole('button', { name: /Continue|Checking/ }) as HTMLButtonElement
const settled = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}

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

it('submits on the 6th digit with length 6, and says how long the code works', async () => {
  const { onsubmit, type } = setup(6)
  expect(screen.getByText('It works for 10 minutes.')).toBeTruthy()
  await type('123456')

  expect(onsubmit).toHaveBeenCalledWith('123456')
})

it('keeps Continue off until every digit is in', async () => {
  const { type } = setup()
  expect(continueButton().disabled).toBe(true)
  await type('1234567')
  expect(continueButton().disabled).toBe(true)
})

it('has no Continue without continueButton, and submits on the last digit', async () => {
  const { onsubmit, type } = setup(6, undefined, undefined, { continueButton: false })
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  await type('123456')

  expect(onsubmit).toHaveBeenCalledWith('123456')
})

it('counts the resend down from 60 on an off button outside any live region, and announces once when it is available', () => {
  const { advance } = setup()
  const countdown = screen.getByRole('button', { name: 'Resend code in 1:00' }) as HTMLButtonElement
  expect(countdown.disabled).toBe(true)
  expect(countdown.closest('[aria-live],[role="alert"]')).toBeNull()
  const live = document.querySelector('[aria-live="polite"]')!
  expect(live.textContent).toBe('')

  advance(1000)
  expect(screen.getByText('Resend code in 0:59')).toBeTruthy()
  advance(59_000)
  expect(live.textContent).toBe('You can request a new code now.')
  expect(screen.getByRole('button', { name: 'Send a new code' })).toBeTruthy()
})

it('shows the expired banner past expiresAt', () => {
  const { advance } = setup()
  advance(10 * 60_000)

  expect(screen.getByRole('status').textContent).toContain('This code has expired. Send a new one to continue.')
})

it('submits a pasted code that fired no input event once on Enter', async () => {
  const { input, onsubmit } = setup()
  input.value = '87654321'
  await fireEvent.keyDown(input, { key: 'Enter' })

  expect(onsubmit).toHaveBeenCalledOnce()
  expect(onsubmit).toHaveBeenCalledWith('87654321')
})

it('shows the length line and sends nothing on Enter with too few digits', async () => {
  const { input, onsubmit, type } = setup()
  await type('123')
  await fireEvent.keyDown(input, { key: 'Enter' })

  expect(onsubmit).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('Enter the 8-digit code')
})

it('reads "Checking…" with a spinner and makes the field read-only while onsubmit runs', async () => {
  const { input, type } = setup(
    8,
    vi.fn(() => new Promise<void>(() => {})),
  )
  await type('12345678')

  expect(continueButton().textContent).toContain('Checking…')
  expect(continueButton().disabled).toBe(true)
  expect(continueButton().querySelector('[role="progressbar"],svg,.progress')).toBeTruthy()
  expect(input.readOnly).toBe(true)
})

it('keeps focus on a wrong code with its digits selected and the error in place of the hint', async () => {
  const onsubmit = vi.fn(async () => {
    throw { body: { message: formError('auth_codeWrong') } }
  })
  const { input, type } = setup(8, onsubmit)
  await type('12345678')
  await settled()

  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 8])
  expect(screen.getByRole('alert').textContent).toContain('That code doesn’t match')
  expect(screen.queryByText('It works for 10 minutes.')).toBeNull()
})

it('locks after too many tries: Continue off, resend on, edits change nothing until a new code', async () => {
  const onsubmit = vi.fn(async () => {
    throw { body: { message: formError('auth_codeLocked') } }
  })
  const { type } = setup(8, onsubmit)
  await type('11111111')
  await settled()

  expect(continueButton().disabled).toBe(true)
  await type('22222222')
  expect(onsubmit).toHaveBeenCalledOnce()
  expect(screen.getByRole('alert').textContent).toContain('Too many tries')

  await fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }))
  await settled()
  expect(continueButton().disabled).toBe(false)
})

it('restarts the countdown at the press, and rolls it back on failure', async () => {
  let fail = (_: unknown) => {}
  const onresend = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)))
  const { advance } = setup(8, undefined, onresend)
  advance(60_000)
  await fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }))

  expect(screen.getByText('Resend code in 1:00')).toBeTruthy()
  fail({ body: { message: formError('auth_mailUnavailable') } })
  await settled()

  expect(screen.getByRole('button', { name: 'Send a new code' })).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('could not send the mail')
})

it('offers "Wrong address? Go back" only with onback', async () => {
  const onback = vi.fn()
  setup(8, undefined, undefined, { onback })
  await fireEvent.click(screen.getByRole('button', { name: 'Go back' }))

  expect(onback).toHaveBeenCalledOnce()
  expect(screen.getByText(/Wrong address\?/)).toBeTruthy()
})

it('never submits the surrounding form from Continue or Resend', async () => {
  const { advance, onformsubmit, type } = setup()
  await type('12345678')
  await fireEvent.click(continueButton())
  advance(60_000)
  await fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }))

  expect(onformsubmit).not.toHaveBeenCalled()
})

it('shows a dot for each digit still to type', async () => {
  const { input, type } = setup(6)
  const dots = () => input.parentElement?.querySelector('[aria-hidden="true"]')?.textContent?.replace(/\s/g, '')

  expect(dots()).toBe('······')
  await type('48a2')
  expect(dots()).toBe('482···')
})

it('takes an autofilled code that fired no input event, and never resubmits on refocus', async () => {
  const { input, onsubmit } = setup(6)

  input.value = '482917'
  await fireEvent.change(input)
  expect(onsubmit).toHaveBeenCalledExactlyOnceWith('482917')

  await fireEvent.focusIn(input)
  expect(onsubmit).toHaveBeenCalledOnce()
})
