import { render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import AuthField from './AuthField.svelte'
import { createFormStore } from './store.svelte'
import * as z from './zod'

vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))

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
