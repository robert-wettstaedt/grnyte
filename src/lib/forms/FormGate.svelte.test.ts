import type { QueryPhase } from '$lib/zero/resource.svelte'
import { render } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import FormGateFixture from './FormGateFixture.svelte'
import type { FormWait } from './gate'

vi.mock('$lib/state/navigation.svelte', () => ({ back: vi.fn() }))
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))

const answered: QueryPhase = { empty: false, kind: 'answered' }

function setup(id: number | undefined) {
  const resource = $state<{ data: undefined | { id: number }; phase: QueryPhase }>({
    data: id == null ? undefined : { id },
    phase: id == null ? { kind: 'loading' } : answered,
  })
  const wait: FormWait = { notFound: 'Not found', resource, whole: false }
  const log: string[] = []
  render(FormGateFixture, { log, wait })
  flushSync()
  const show = (next: number | undefined) => {
    resource.data = next == null ? undefined : { id: next }
    resource.phase = next == null ? { kind: 'loading' } : answered
    flushSync()
  }
  return { log, show }
}

describe('FormGate seeding', () => {
  it('seeds before the children first mount', () => {
    expect(setup(1).log).toEqual(['seed:1', 'mount:1'])
  })

  it('re-seeds a new id without remounting mounted children', () => {
    const { log, show } = setup(1)
    show(2)
    expect(log).toEqual(['seed:1', 'mount:1', 'seed:2'])
  })

  it('does not re-seed the same id after the gate closes and reopens', () => {
    const { log, show } = setup(1)
    show(undefined)
    show(1)
    expect(log).toEqual(['seed:1', 'mount:1', 'mount:1'])
  })

  it('seeds a new id before remounting after the gate closed', () => {
    const { log, show } = setup(undefined)
    show(1)
    show(undefined)
    show(2)
    expect(log).toEqual(['seed:1', 'mount:1', 'seed:2', 'mount:2'])
  })
})
