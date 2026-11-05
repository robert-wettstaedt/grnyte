import { describe, expect, it } from 'vitest'
import { Selection } from './selection.svelte'

describe('Selection', () => {
  it('ticks and unticks, and leaves select mode empty', () => {
    const selection = new Selection()
    selection.start()
    selection.toggle(1)
    selection.toggle(2)
    selection.toggle(1)
    expect(selection.picked).toEqual([2])

    selection.done()
    expect(selection.active).toBe(false)
    expect(selection.picked).toEqual([])
  })

  it('starts every select mode with nothing ticked', () => {
    const selection = new Selection()
    selection.start()
    selection.toggle(4)
    selection.start()
    expect(selection.picked).toEqual([])
  })
})
