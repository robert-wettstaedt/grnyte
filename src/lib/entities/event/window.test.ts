import type { QueryPhase } from '$lib/zero/resource.svelte'
import { describe, expect, it } from 'vitest'
import { firstWindowConfirmed, shownWindowPhase } from './window'

const answered: QueryPhase = { empty: false, kind: 'answered' }

describe('the first feed window', () => {
  it('is marked read only once the server confirmed it', () => {
    expect(firstWindowConfirmed(answered, 3)).toBe(true)
    expect(firstWindowConfirmed({ kind: 'arriving' }, 3)).toBe(false)
    expect(firstWindowConfirmed({ empty: true, kind: 'answered' }, 0)).toBe(false)
  })

  it('shows no unconfirmed rows before it is marked, since they are other queries leftovers', () => {
    expect(shownWindowPhase({ kind: 'arriving' }, false)).toEqual({ kind: 'loading' })
  })

  it('shows arriving rows once marked, and every other phase as it is', () => {
    expect(shownWindowPhase({ kind: 'arriving' }, true)).toEqual({ kind: 'arriving' })
    expect(shownWindowPhase(answered, false)).toEqual(answered)
    expect(shownWindowPhase({ excluded: true, kind: 'unavailable' }, false)).toEqual({
      excluded: true,
      kind: 'unavailable',
    })
  })
})
