/** The iOS return page: no client script, never cached or referred, and one plain link home. */
import { render } from 'svelte/server'
import { describe, expect, it, vi } from 'vitest'
import { csr, load } from './+page'
import Page from './+page.svelte'

describe('/app-return', () => {
  it('ships no client script and answers no-store and no-referrer', async () => {
    const setHeaders = vi.fn()
    await load({ setHeaders } as never)

    expect(csr).toBe(false)
    expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  })

  it('says to go back to the app and links only to the home page, with no query', () => {
    const { body } = render(Page)

    expect(body).toContain('Go back to the grnyte app.')
    expect([...body.matchAll(/href="([^"]*)"/g)].map(([, href]) => href)).toEqual(['/'])
    expect(body).not.toContain('<script')
  })
})
