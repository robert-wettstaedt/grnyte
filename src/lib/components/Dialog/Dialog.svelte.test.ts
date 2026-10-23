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
