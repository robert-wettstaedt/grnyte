import { setLocale } from '$lib/paraglide/runtime'
import { render, screen } from '@testing-library/svelte'
import { expect, it, onTestFinished, vi } from 'vitest'
import Page from './+page.svelte'

const at = vi.hoisted(() => ({ url: new URL('http://localhost/auth/continue') }))
vi.mock('$app/state', () => ({ page: at }))

function open(search: string) {
  at.url = new URL(`http://localhost/auth/continue${search}`)
  const replace = vi.fn()
  const assign = vi.fn()
  vi.stubGlobal('location', { ...location, assign, replace })
  onTestFinished(() => void vi.unstubAllGlobals())
  render(Page)
  return { assign, replace }
}

it('replaces its own history entry with the destination, once', () => {
  const { replace } = open('?next=%2Froutes%2F1')

  expect(replace.mock.calls).toEqual([['/routes/1']])
  expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/routes/1')
})

it.each(['%2F%2Fevil.example', '%2Fauth%2Fsignin', '%2F%5Cevil.example', ''])(
  'goes home instead for next=%s',
  (next) => {
    const { replace } = open(`?next=${next}`)

    expect(replace.mock.calls).toEqual([['/explore']])
    expect(screen.getByRole('link')).toHaveAttribute('href', '/explore')
  },
)

it('reads in German', () => {
  setLocale('de', { reload: false })
  onTestFinished(() => setLocale('en', { reload: false }))
  open('?next=%2Froutes%2F1')

  expect(screen.getByRole('heading', { name: 'Du wirst weitergeleitet…' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Weiter' })).toBeTruthy()
})
