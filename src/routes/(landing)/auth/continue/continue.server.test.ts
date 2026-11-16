/** `/auth/continue` without JavaScript: the server render already links to the destination. */
import { render } from 'svelte/server'
import { expect, it, vi } from 'vitest'

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/auth/continue?next=%2Froutes%2F1') } }))

const { default: Page } = await import('./+page.svelte')

it('renders a plain link to the checked destination', () => {
  const { body } = render(Page)

  expect([...body.matchAll(/href="([^"]*)"/g)].map(([, href]) => href)).toEqual(['/routes/1'])
})
