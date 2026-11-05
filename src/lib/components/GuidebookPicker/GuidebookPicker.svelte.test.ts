import { render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import GuidebookPicker, { type PickerItem } from './GuidebookPicker.svelte'

const item = (id: number, title: string, extra: Partial<PickerItem> = {}): PickerItem => ({ id, title, ...extra })
const titles = () => screen.getAllByRole('button').map((button) => button.textContent?.trim() ?? '')

describe('GuidebookPicker', () => {
  it('keeps shown rows in place and appends what syncs in later', async () => {
    const props = {
      emptyLabel: 'None',
      items: [item(1, 'Kante'), item(2, 'Riss')],
      onpick: vi.fn(),
      placeholder: 'Search',
      settled: false,
    }
    const { rerender } = render(GuidebookPicker, props)

    await rerender({ ...props, items: [item(3, 'Ampel'), item(1, 'Kante'), item(2, 'Riss')] })

    expect(titles().map((title) => title.split(/\s/)[0])).toEqual(['Kante', 'Riss', 'Ampel'])
  })

  it('lists the pinned rows first and shows a disabled row with its reason', () => {
    render(GuidebookPicker, {
      emptyLabel: 'None',
      items: [item(1, 'Far'), item(2, 'Near'), item(3, 'Blocked', { reason: 'Holds blocks' })],
      onpick: vi.fn(),
      pinned: [item(2, 'Near')],
      pinnedLabel: 'On this sector',
      placeholder: 'Search',
      settled: true,
    })

    expect(titles().map((title) => title.split(/\s/)[0])).toEqual(['Near', 'Far'])
    expect(screen.getByText('Holds blocks')).toBeTruthy()
  })

  it('says nothing about an empty list until it is settled', async () => {
    const props = { emptyLabel: 'Nothing here', items: [], onpick: vi.fn(), placeholder: 'Search', settled: false }
    const { rerender } = render(GuidebookPicker, props)
    expect(screen.queryByText('Nothing here')).toBeNull()

    await rerender({ ...props, settled: true })
    expect(screen.getByText('Nothing here')).toBeTruthy()
  })
})
