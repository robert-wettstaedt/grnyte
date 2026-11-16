import { fireEvent, render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import AuthField from './AuthField.svelte'
import { formError } from './schemas'
import { createFormStore, type StoreField } from './store.svelte'
import * as z from './zod'

vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))

it('shows the password as text and hides it again, keeping focus and the caret in the field', async () => {
  const store = createFormStore(z.object({ password: z.string() }))
  render(AuthField, {
    autocomplete: 'new-password',
    field: store.fields.password,
    label: 'Password',
    reveal: true,
    type: 'password',
  })
  const input = screen.getByLabelText('Password') as HTMLInputElement
  input.value = 'climbing-hard'
  input.focus()
  input.setSelectionRange(3, 5)

  await fireEvent.click(screen.getByRole('button', { name: 'Show' }))
  expect(input.type).toBe('text')
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])

  // Moved meanwhile, so the restore is measured, not a leftover.
  input.setSelectionRange(7, 7)
  await fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
  expect(input.type).toBe('password')
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([7, 7])
})

it('passes the input attributes through to the <input>', () => {
  const store = createFormStore(z.object({ username: z.string() }))
  const oninput = vi.fn()
  render(AuthField, {
    autocapitalize: 'none',
    autocomplete: 'one-time-code',
    field: store.fields.username,
    inputmode: 'numeric',
    label: 'Code',
    maxlength: 8,
    oninput,
    pattern: '[0-9]*',
    spellcheck: 'false',
    type: 'text',
  })
  const input = screen.getByLabelText('Code') as HTMLInputElement

  expect(input.getAttribute('inputmode')).toBe('numeric')
  expect(input.getAttribute('pattern')).toBe('[0-9]*')
  expect(input.maxLength).toBe(8)
  expect(input.getAttribute('autocapitalize')).toBe('none')
  expect(input.getAttribute('spellcheck')).toBe('false')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(oninput).toHaveBeenCalledOnce()
})

it('shows the password when its error is a surrounding space, and the error in place of the hint', () => {
  const field: StoreField<string> = {
    as: (type) => ({ name: 'password', type: type === 'select' ? 'text' : type, value: ' climb' }),
    issues: () => [{ message: formError('auth_passwordSpaces'), path: [] }],
    set: () => {},
    value: () => ' climb',
  }
  render(AuthField, {
    autocomplete: 'new-password',
    field,
    hint: 'At least 8 characters.',
    label: 'Password',
    reveal: true,
    type: 'password',
  })

  expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('text')
  expect(screen.getByRole('alert').textContent).toContain('start or end with a space')
  expect(screen.queryByText('At least 8 characters.')).toBeNull()
})
