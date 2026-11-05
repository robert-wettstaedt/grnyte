import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import MergePanel from './MergePanel.svelte'

vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))

const noop = () => {}
const LONG = 'x'.repeat(200)
const base = {
  confirm: { body: 'Kante will be merged into Linke Kante.', counts: null, onback: noop, onmerge: noop },
  fields: {
    onback: noop,
    onnext: noop,
    questions: [
      {
        key: 'description',
        label: 'Description',
        options: [
          { caption: 'On Linke Kante, which stays', side: 'survivor' as const, value: LONG },
          { caption: 'From Kante', side: 'source' as const, value: 'Short' },
        ],
      },
    ],
  },
  pick: {
    emptyLabel: 'None',
    items: [],
    onpick: noop,
    pinned: [],
    pinnedLabel: 'Nearby',
    placeholder: 'Search',
    settled: true,
  },
}

describe('MergePanel', () => {
  it('offers More only on a long value, and expands it in place', async () => {
    render(MergePanel, { ...base, step: 'fields' })

    const more = screen.getAllByRole('button', { name: /more/i })
    expect(more).toHaveLength(1)
    await fireEvent.click(more[0])
    expect(screen.getByRole('button', { name: /less/i })).toBeTruthy()
  })

  it('holds the merge back until the counts are in', async () => {
    const { rerender } = render(MergePanel, { ...base, step: 'confirm' })
    expect((screen.getByRole('button', { name: /^merge$/i }) as HTMLButtonElement).disabled).toBe(true)

    await rerender({ ...base, confirm: { ...base.confirm, counts: [{ label: 'Ascents', value: 3 }] }, step: 'confirm' })
    expect((screen.getByRole('button', { name: /^merge$/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('3')).toBeTruthy()
  })
})
