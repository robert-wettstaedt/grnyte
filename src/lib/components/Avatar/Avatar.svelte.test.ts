import { render } from '@testing-library/svelte'
import { expect, it } from 'vitest'
import Avatar from './Avatar.svelte'

it('shows a neutral face for a deleted account, never initials', () => {
  const { container } = render(Avatar, { deleted: true, name: 'Deleted user', solid: true })

  expect(container.textContent?.trim()).toBe('')
  expect(container.querySelector('svg')).not.toBeNull()
})
