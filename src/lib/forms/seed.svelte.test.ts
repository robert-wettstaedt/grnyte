import { flushSync } from 'svelte'
import { expect, it } from 'vitest'
import { seedFollowingRows } from './seed.svelte'

const harness = () => {
  const source = $state({ id: 1 as number | undefined, rows: ['old'] })
  const form = $state({ rows: [] as string[] })
  let seeds = 0
  const stop = $effect.root(() => {
    seedFollowingRows(
      () => source.id,
      () => source.rows.join('|'),
      () => form.rows,
      () => {
        seeds++
        form.rows = [...source.rows]
      },
    )
  })
  flushSync()
  return { form, seeds: () => seeds, source, stop }
}

it('follows newer rows while the form still holds its last seed', () => {
  const { form, source, stop } = harness()
  expect(form.rows).toEqual(['old'])

  source.rows = ['new']
  flushSync()

  expect(form.rows).toEqual(['new'])
  stop()
})

it('keeps edits when newer rows arrive, and seeds a different entity regardless', () => {
  const { form, seeds, source, stop } = harness()
  form.rows = ['typed']

  source.rows = ['new']
  flushSync()
  expect(form.rows).toEqual(['typed'])

  source.id = 2
  flushSync()
  expect(form.rows).toEqual(['new'])
  expect(seeds()).toBe(2)
  stop()
})
