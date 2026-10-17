import { seedForm } from '$lib/forms/seed.svelte'
import { render } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import { expect, it, vi } from 'vitest'
import BlockLocationFieldFixture from './BlockLocationFieldFixture.svelte'

// OpenLayers needs a canvas jsdom does not have; the switch is what is under test.
vi.mock('$lib/map/Map.svelte', () => ({ default: () => {} }))

it('keeps a rough pin rough through a form seed', async () => {
  const changes: boolean[] = []
  const { container } = render(BlockLocationFieldFixture, { changes })
  const form = container.querySelector('form')!

  // The cancelled reset `seedForm` dispatches is what used to snap the switch to unchecked.
  await seedForm({ element: form, fields: { allIssues: () => undefined, set: () => undefined } }, {})
  flushSync()
  await tick()

  expect(changes).toEqual([])
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true)
})

it('still reports the reader turning it off', async () => {
  const changes: boolean[] = []
  const { container } = render(BlockLocationFieldFixture, { changes })

  container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  flushSync()
  await tick()

  expect(changes).toEqual([false])
})
