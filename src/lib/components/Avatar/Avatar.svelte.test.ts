import { render } from '@testing-library/svelte'
import { expect, it } from 'vitest'
import Avatar from './Avatar.svelte'

it('shows a neutral face for a deleted author, never initials', () => {
  const { container } = render(Avatar, { author: { id: null, name: 'Deleted user' }, solid: true })

  expect(container.textContent?.trim()).toBe('')
  expect(container.querySelector('svg')).not.toBeNull()
})

it('shows a live author by initials, and a placeholder while their name syncs', () => {
  expect(render(Avatar, { author: { id: 4, name: 'Mara Lindqvist' } }).container.textContent?.trim()).toBe('ML')
  expect(render(Avatar, { author: { id: 4, name: '' } }).container.querySelector('.animate-pulse')).not.toBeNull()
})
