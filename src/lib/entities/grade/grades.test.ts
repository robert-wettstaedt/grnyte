/**
 * The one invariant the grade ladder rests on, asserted against the real table.
 *
 * `grades.id` IS the ordinal: `getGradeBand` buckets on id thresholds, `deriveStats` takes the
 * largest id as the hardest send, the ceiling accolade compares ids, and
 * `recalcUserGradeAndRating` averages them. None of that joins anything, and none of it fails
 * loudly when the assumption breaks. A grade inserted anywhere but the end silently produces a
 * wrong hardest-send, a wrong community grade and wrong colours, with no error anywhere.
 *
 * This file is what makes that assumption checkable rather than tribal.
 */
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { getGradeBand } from './color'

interface GradeRow {
  FB: string
  id: number
  ircra: null | number
  V: string
}

const rows = reachable
  ? await sql<GradeRow[]>`select id, "FB", "V", ircra from grades order by id`
  : []

describe.skipIf(!reachable)('the grade ladder', () => {
  afterAll(async () => {
    await sql.end()
  })

  it('numbers its grades contiguously from zero', () => {
    expect(rows.map((row) => row.id)).toEqual(rows.map((_, index) => index))
  })

  it('runs easy → hard, cross-checked against IRCRA', () => {
    // IRCRA is an independently published ordering, so it catches a row filed in the wrong
    // place even though the ids themselves would still be contiguous. It repeats where IRCRA
    // is coarser than Font (6A+/6B, 6C+/7A), hence non-decreasing rather than strictly rising.
    const ircra = rows.map((row) => row.ircra).filter((value): value is number => value != null)
    expect(ircra).toEqual([...ircra].sort((a, b) => a - b))
  })

  it('keeps the colour bands on the Font boundaries they are named for', () => {
    // Pins the four thresholds in `getGradeBand` to the grades they mean, so shifting the
    // ladder without shifting them fails here rather than silently recolouring the app.
    const firstOfBand = [1, 2, 3, 4].map((band) => rows.find((row) => getGradeBand(row.id) === band)?.FB)
    expect(firstOfBand).toEqual(['FB 3', 'FB 6A', 'FB 7A+', 'FB 8A'])
  })

  it('gives every grade both scales and a band', () => {
    for (const row of rows) {
      expect(row.FB, `grade ${row.id} FB`).toBeTruthy()
      expect(row.V, `grade ${row.id} V`).toBeTruthy()
      expect(getGradeBand(row.id), `grade ${row.id} band`).toBeDefined()
    }
  })
})
