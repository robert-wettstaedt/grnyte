import { fireEvent, render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import Dialog from './Dialog.svelte'

it('runs the confirm once while it is pending, however often it is tapped', async () => {
  let settle = () => {}
  const onsave = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)))
  render(Dialog, { onsave, open: true, saveText: 'Delete', title: 'Delete ascent' })
  const confirm = screen.getByRole('button', { name: 'Delete' })

  await fireEvent.click(confirm)
  await fireEvent.click(confirm)

  expect(onsave).toHaveBeenCalledTimes(1)
  expect((confirm as HTMLButtonElement).disabled).toBe(true)
  settle()
})

it('orders Cancel, the second action, then the main action, which mobile stacks bottom to top', () => {
  render(Dialog, {
    onsave: () => {},
    open: true,
    saveText: 'Tidy up',
    secondary: { onclick: () => {}, text: 'Breaks the rules' },
    title: 'Delete route',
  })
  const footer = screen.getByRole('button', { name: 'Tidy up' }).parentElement!

  expect([...footer.querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual([
    'Cancel',
    'Breaks the rules',
    'Tidy up',
  ])
  // jsdom has no layout, so the reversal that puts the main action on top is pinned by its classes.
  expect(footer.className).toMatch(/\bflex-col-reverse\b.*\bmd:flex-row\b/)
})

it('runs only the second action when it is pressed, then closes', async () => {
  const onsave = vi.fn()
  const onclick = vi.fn()
  const onOpenChange = vi.fn()
  render(Dialog, {
    onOpenChange,
    onsave,
    open: true,
    saveText: 'Tidy up',
    secondary: { onclick, text: 'Breaks the rules' },
    title: 'Delete route',
  })

  await fireEvent.click(screen.getByRole('button', { name: 'Breaks the rules' }))

  expect(onclick).toHaveBeenCalledTimes(1)
  expect(onsave).not.toHaveBeenCalled()
  expect(onOpenChange).toHaveBeenCalledWith({ open: false })
})

it('marks a destructive main action in the error colour, and only that one', () => {
  render(Dialog, { destructive: true, onsave: () => {}, open: true, saveText: 'Delete', title: 'Delete ascent' })

  expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('preset-filled-error-500')
  expect(screen.getByRole('button', { name: 'Cancel' }).className).not.toContain('error')
})

it('keeps a confirm that is not destructive in the neutral colour', () => {
  render(Dialog, { onsave: () => {}, open: true, saveText: 'Save', title: 'Rename' })

  expect(screen.getByRole('button', { name: 'Save' }).className).not.toContain('error')
})
