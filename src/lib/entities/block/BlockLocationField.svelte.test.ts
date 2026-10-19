import { render } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import { expect, it, vi } from 'vitest'
import BlockLocationFieldFixture from './BlockLocationFieldFixture.svelte'

// OpenLayers needs a canvas jsdom does not have; the switch is what is under test.
vi.mock('$lib/map/Map.svelte', () => ({ default: () => {} }))

it('still reports the reader turning it off', async () => {
  const changes: boolean[] = []
  const { container } = render(BlockLocationFieldFixture, { changes })

  container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  flushSync()
  await tick()

  expect(changes).toEqual([false])
})
