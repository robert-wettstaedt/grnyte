import { formError } from '$lib/forms/schemas'
import { settle } from '$lib/forms/screen.fixture'
import { wipeAndLeave } from '$lib/state/wipe'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enterCode, reauthRemote as remote, resetReauthRemote } from './reauth.fixture'
import Fixture from './ReauthStepFixture.svelte'

vi.mock('./reauth.remote', async () => (await import('./reauth.fixture')).reauthRemote)
vi.mock('$lib/state/wipe', () => ({ wipeAndLeave: vi.fn(async () => {}) }))

let onformsubmit = vi.fn()
beforeEach(() => {
  resetReauthRemote(false)
  onformsubmit = vi.fn()
})

const mount = (props: Record<string, unknown> = {}) =>
  render(Fixture, { props: { action: 'region.delete', onformsubmit, target: '1', ...props } })
const step = () => document.querySelector('[data-reauth-step]')!
const confirmed = () => screen.getByTestId('confirmed').textContent
const sendCode = () => screen.queryByRole('button', { name: 'Send code' })

it('holds a skeleton for 250 ms while the peek is pending', async () => {
  remote.reauthGrantStatus.mockImplementation(() => new Promise<boolean>(() => {}))
  mount()
  await settle()

  expect(step().querySelector('.skeleton-hold')).toBeTruthy()
  expect(sendCode()).toBeNull()
})

it('shows a live grant as confirmed and mails nothing', async () => {
  remote.reauthGrantStatus.mockImplementation(async () => true)
  mount()
  await settle()

  expect(screen.getByText('Confirmed for the next 5 minutes.')).toBeTruthy()
  expect(confirmed()).toBe('true')
  expect(remote.requestReauthCode).not.toHaveBeenCalled()
})

it('mails nothing on mount and requests once on "Send code", without submitting the form', async () => {
  mount()
  await settle()
  expect(remote.reauthGrantStatus).toHaveBeenCalledWith({ action: 'region.delete', target: '1' })
  expect(remote.requestReauthCode).not.toHaveBeenCalled()

  await fireEvent.click(sendCode()!)
  await settle()

  expect(remote.requestReauthCode).toHaveBeenCalledOnce()
  expect(onformsubmit).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Code')).toBeTruthy()
})

it('sets confirmed on a correct code and runs no action', async () => {
  mount()
  await settle()
  await fireEvent.click(sendCode()!)
  await settle()
  await enterCode('123456')

  expect(remote.confirmReauthCode).toHaveBeenCalledWith({ action: 'region.delete', code: '123456', target: '1' })
  expect(confirmed()).toBe('true')
  expect(onformsubmit).not.toHaveBeenCalled()
})

it('require() unconfirms, requests at once, and confirms again after the code without running anything', async () => {
  remote.reauthGrantStatus.mockImplementation(async () => true)
  mount()
  await settle()
  await fireEvent.click(screen.getByRole('button', { name: 'require' }))
  await settle()

  expect(confirmed()).toBe('false')
  expect(remote.requestReauthCode).toHaveBeenCalledOnce()
  expect(screen.getByText(/needs a fresh confirmation/)).toBeTruthy()
  await enterCode('654321')

  expect(confirmed()).toBe('true')
  expect(onformsubmit).not.toHaveBeenCalled()
})

it('starts over for a new target, unconfirmed while the new peek is pending', async () => {
  remote.reauthGrantStatus.mockImplementation(async () => true)
  const { rerender } = mount()
  await settle()
  expect(confirmed()).toBe('true')

  remote.reauthGrantStatus.mockImplementation(() => new Promise<boolean>(() => {}))
  await rerender({ target: '2' })
  await settle()

  expect(confirmed()).toBe('false')
  expect(remote.reauthGrantStatus).toHaveBeenLastCalledWith({ action: 'region.delete', target: '2' })
})

it('keeps its skeleton after the peek answered while not ready', async () => {
  mount({ ready: false })
  await settle()

  expect(step().querySelector('.skeleton-hold')).toBeTruthy()
  expect(sendCode()).toBeNull()
})

describe('a session ended on another device', () => {
  const ended = { body: { message: formError('auth_sessionEnded') }, status: 401 }
  const shown = () => screen.queryByText('You were signed out on this device. Sign in again.')
  beforeEach(() => vi.mocked(wipeAndLeave).mockClear())

  it('leaves from "Send code" with no error text', async () => {
    remote.requestReauthCode.mockRejectedValueOnce(ended)
    mount()
    await settle()
    await fireEvent.click(sendCode()!)
    await settle()

    expect(wipeAndLeave).toHaveBeenCalledOnce()
    expect(shown()).toBeNull()
  })

  it('leaves from the code with no error text', async () => {
    remote.confirmReauthCode.mockRejectedValueOnce(ended)
    mount()
    await settle()
    await fireEvent.click(sendCode()!)
    await settle()
    await enterCode('123456')

    expect(wipeAndLeave).toHaveBeenCalledOnce()
    expect(shown()).toBeNull()
  })

  it('leaves from the peek', async () => {
    remote.reauthGrantStatus.mockRejectedValueOnce(ended)
    mount()
    await settle()

    expect(wipeAndLeave).toHaveBeenCalledOnce()
  })
})

describe('with "Confirm with Apple" as the alternative', () => {
  const apple = () => screen.queryByRole('button', { name: 'Confirm with Apple' })
  let submitted: HTMLFormElement[] = []
  beforeEach(() => {
    submitted = []
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      submitted.push(this)
    })
  })

  it('shows it above "Send code" in the settled render, and mails nothing', async () => {
    mount({ apple: true })
    await settle()

    expect(apple()).toBeTruthy()
    expect(apple()!.compareDocumentPosition(sendCode()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(remote.requestReauthCode).not.toHaveBeenCalled()
  })

  it('require() goes back to the choice and mails nothing until "Send code", then confirms without running anything', async () => {
    remote.reauthGrantStatus.mockImplementation(async () => true)
    mount({ apple: true })
    await settle()
    await fireEvent.click(screen.getByRole('button', { name: 'require' }))
    await settle()

    expect(confirmed()).toBe('false')
    expect(apple()).toBeTruthy()
    expect(remote.requestReauthCode).not.toHaveBeenCalled()
    await fireEvent.click(sendCode()!)
    await settle()
    await enterCode('654321')

    expect(confirmed()).toBe('true')
    expect(onformsubmit).not.toHaveBeenCalled()
  })

  it('posts a form of its own to the Apple start, once, and holds both buttons', async () => {
    mount({ apple: true })
    await settle()
    await fireEvent.click(apple()!)
    await fireEvent.click(apple()!)
    await settle()

    expect(submitted).toHaveLength(1)
    const [form] = submitted
    expect(form.method).toBe('post')
    expect(new URL(form.action).pathname).toBe('/auth/oauth/apple')
    expect(form.parentElement).toBe(document.body)
    expect(Object.fromEntries(new FormData(form))).toEqual({
      action: 'region.delete',
      intent: 'confirm',
      returnTo: '/regions/1/delete',
      target: '1',
    })
    expect(apple()!.hasAttribute('disabled')).toBe(true)
    expect(sendCode()!.hasAttribute('disabled')).toBe(true)
    expect(onformsubmit).not.toHaveBeenCalled()
  })
})

it('names the address before and after sending, and submits the code with no Continue', async () => {
  mount()
  await settle()
  expect(screen.getByText('We’ll email a 6-digit code to sam@posteo.de.')).toBeTruthy()

  await fireEvent.click(sendCode()!)
  await settle()
  expect(screen.getByText('Enter the 6-digit code we sent to sam@posteo.de.')).toBeTruthy()
  expect(screen.getByText('It works for 10 minutes.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
})
