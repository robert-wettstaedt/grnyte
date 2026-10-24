import { fireEvent, render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import RemovalChoice from './RemovalChoice.svelte'

const nav = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }))
vi.mock('$lib/state/navigation.svelte', () => ({ push: nav.goto }))

it('tidies up with today s delete', async () => {
  const ontidy = vi.fn()
  render(RemovalChoice, { id: 3, kind: 'route', ontidy, open: true, title: 'Odin' })

  await fireEvent.click(await screen.findByRole('button', { name: 'Tidy up' }))

  expect(ontidy).toHaveBeenCalledTimes(1)
  expect(nav.goto).not.toHaveBeenCalled()
})

it('sends a rule-breaking removal to its page, deleting nothing', async () => {
  const ontidy = vi.fn()
  render(RemovalChoice, { id: 3, kind: 'route', ontidy, open: true, title: 'Odin' })

  await fireEvent.click(await screen.findByRole('button', { name: 'Breaks the rules…' }))

  expect(nav.goto).toHaveBeenCalledWith('/remove/route/3')
  expect(ontidy).not.toHaveBeenCalled()
})
