import { describe, expect, it } from 'vitest'
import { fieldRows } from './fieldRows.svelte'

type Row = { name: string; url: string }

const BLANK: Row = { name: '', url: '' }

/** A form seeded with `values`, capturing whatever the rows write back. */
const form = (values: (Partial<Row> | undefined)[], count = values.length) => {
  const written: Row[][] = []
  const rows = fieldRows({ blank: BLANK, count, read: () => values, write: (next) => written.push(next) })
  return { rows, written }
}

describe('fieldRows', () => {
  it('starts with one key per seeded row', () => {
    expect(form([{ name: 'a' }, { name: 'b' }]).rows.keys).toEqual([0, 1])
  })

  it('gives an added row a key of its own', () => {
    const { rows } = form([])
    rows.add()
    rows.add()
    expect(rows.keys).toEqual([0, 1])
  })

  it('re-seeds the remaining rows so a removed row does not slide its values onto its neighbour', () => {
    const { rows, written } = form([
      { name: 'a', url: 'A' },
      { name: 'b', url: 'B' },
      { name: 'c', url: 'C' },
    ])

    rows.remove(1)

    expect(written).toEqual([
      [
        { name: 'a', url: 'A' },
        { name: 'c', url: 'C' },
      ],
    ])
  })

  it('drops the removed row key and keeps the others, so surviving inputs stay with their row', () => {
    const { rows } = form([{ name: 'a' }, { name: 'b' }, { name: 'c' }])
    rows.remove(1)
    expect(rows.keys).toEqual([0, 2])
  })

  it('keeps a row nobody has typed in as a blank row rather than dropping it', () => {
    // The form only holds values for rows that were seeded or typed into, so the untouched rows
    // below are holes. Reading them as holes would shorten the list and misalign everything after.
    const { rows, written } = form([undefined, undefined, { name: 'typed', url: 'U' }])

    rows.remove(0)

    expect(written).toEqual([[BLANK, { name: 'typed', url: 'U' }]])
  })

  it('fills in the fields of a partially typed row', () => {
    const { rows, written } = form([{ name: 'only a name' }, { name: 'b', url: 'B' }])
    rows.remove(1)
    expect(written).toEqual([[{ name: 'only a name', url: '' }]])
  })

  it('never reuses a key, so a row added after a removal is new to the each block', () => {
    const { rows } = form([{ name: 'a' }, { name: 'b' }])
    rows.remove(0)
    rows.add()
    expect(rows.keys).toEqual([1, 2])
  })

  it('writes an empty list when the last row goes', () => {
    const { rows, written } = form([{ name: 'a', url: 'A' }])
    rows.remove(0)
    expect(written).toEqual([[]])
    expect(rows.keys).toEqual([])
  })
})
