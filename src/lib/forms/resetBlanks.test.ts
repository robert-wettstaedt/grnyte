/**
 * What a DOM form reset does to an input Svelte has written a value into. Four wrong models
 * preceded this, the last of them wrong in the direction that loses data.
 *
 * Svelte compiles `value={x}` to a property write, and whether that reaches `defaultValue` (what a
 * reset restores) is decided by the input's type alone. jsdom here; confirmed in Chrome.
 */
import { describe, expect, it } from 'vitest'

/** One input carrying a value the way Svelte sets one: property write, no attribute. */
const written = (type: string, apply: (input: HTMLInputElement) => void): HTMLInputElement => {
  const input = document.createElement('input')
  input.type = type
  apply(input)
  return input
}

describe('a DOM form reset', () => {
  it('leaves a hidden input alone, because its value property reflects the attribute', () => {
    const input = written('hidden', (element) => (element.value = 'ID-42'))

    expect(input.getAttribute('value')).toBe('ID-42')
    expect(input.defaultValue).toBe('ID-42')
  })

  it('blanks text and number inputs, because theirs does not', () => {
    for (const type of ['text', 'number']) {
      const input = written(type, (element) => (element.value = '7'))

      expect(input.getAttribute('value')).toBeNull()
      expect(input.defaultValue).toBe('')
    }
  })

  it('unchecks a checkbox, which is the only thing a checkbox submits', () => {
    // The trap: a checkbox's `value` DOES reflect, so probing `.value` says it is safe. But
    // checkedness is what it submits, and `.checked` writes no attribute.
    const input = written('checkbox', (element) => {
      element.value = 'yes'
      element.checked = true
    })

    expect(input.getAttribute('value')).toBe('yes')
    expect(input.getAttribute('checked')).toBeNull()
    expect(input.defaultChecked).toBe(false)
  })

  it('restores all of that on a real reset, not just in the attributes', () => {
    const form = document.createElement('form')
    const hidden = written('hidden', (element) => (element.value = 'ID-42'))
    const text = written('text', (element) => (element.value = 'typed'))
    const checkbox = written('checkbox', (element) => (element.checked = true))
    form.append(hidden, text, checkbox)
    document.body.append(form)

    try {
      form.reset()

      expect(hidden.value).toBe('ID-42')
      expect(text.value).toBe('')
      expect(checkbox.checked).toBe(false)
    } finally {
      // In a `finally`, or a failing assertion leaks the form into every later test in the run.
      form.remove()
    }
  })
})
