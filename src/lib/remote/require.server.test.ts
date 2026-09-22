/**
 * The gate AGENTS.md mandates for every mutation on an existing row. Its failure branches had no
 * behavioural test: `gates.test.ts` only asserts that handlers NAME it, never that it refuses.
 *
 * No database. Both helpers take the load and the predicate as arguments, so the row a handler
 * would fetch is an ordinary return value here.
 */
import { APP_PERMISSION_ADMIN, REGION_PERMISSION_READ } from '$lib/auth'
import { formError } from '$lib/forms/schemas'
import { isHttpError, isValidationError } from '@sveltejs/kit'
import { describe, expect, it } from 'vitest'
import { requireAppAdmin, requireRow, requireRowForm } from './require.server'

interface Row {
  id: number
  regionFk: number
}

const ROW: Row = { id: 7, regionFk: 3 }
const NOT_FOUND = formError('blocks_notFound')
const DENIED = formError('form_noPermission')

/** Records what the gate handed the predicate, so "was it asked at all" is assertable. */
function predicate(verdict: boolean) {
  const seen: (Row | undefined)[] = []
  return {
    allow: (row: Row) => {
      seen.push(row)
      return verdict
    },
    seen,
  }
}

/** Both helpers report by throwing, so the thrown value is the assertion subject. */
async function thrown(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error) {
    return error
  }

  throw new Error('expected a throw, got a return')
}

describe('requireRow', () => {
  it('hands the predicate the fetched row and returns it', async () => {
    const gate = predicate(true)
    const row = await requireRow(async () => ROW, gate.allow, NOT_FOUND)

    expect(gate.seen).toEqual([ROW])
    expect(row).toBe(ROW)
  })

  it('404s a missing row with the key the caller named', async () => {
    const error = await thrown(() =>
      requireRow(
        async () => undefined,
        () => true,
        NOT_FOUND,
      ),
    )

    expect(isHttpError(error)).toBe(true)
    expect(error).toMatchObject({ body: { message: NOT_FOUND }, status: 404 })
  })

  it('never consults the predicate for a missing row', async () => {
    const gate = predicate(true)
    await thrown(() => requireRow(async () => undefined, gate.allow, NOT_FOUND))

    expect(gate.seen).toEqual([])
  })

  it('403s a refused row as form_noPermission, not as the caller’s key', async () => {
    const error = await thrown(() =>
      requireRow(
        async () => ROW,
        () => false,
        NOT_FOUND,
      ),
    )

    expect(isHttpError(error)).toBe(true)
    expect(error).toMatchObject({ body: { message: DENIED }, status: 403 })
  })
})

describe('requireRowForm', () => {
  it('hands the predicate the fetched row and returns it', async () => {
    const gate = predicate(true)
    const row = await requireRowForm(async () => ROW, gate.allow, NOT_FOUND)

    expect(gate.seen).toEqual([ROW])
    expect(row).toBe(ROW)
  })

  it('reports a missing row as a form issue rather than a 404', async () => {
    const error = await thrown(() =>
      requireRowForm(
        async () => undefined,
        () => true,
        NOT_FOUND,
      ),
    )

    expect(isValidationError(error)).toBe(true)
    expect(isHttpError(error)).toBe(false)
    expect(error).toMatchObject({ issues: [{ message: NOT_FOUND }] })
  })

  it('never consults the predicate for a missing row', async () => {
    const gate = predicate(true)
    await thrown(() => requireRowForm(async () => undefined, gate.allow, NOT_FOUND))

    expect(gate.seen).toEqual([])
  })

  it('reports a refusal as form_noPermission, not as the caller’s key', async () => {
    const error = await thrown(() =>
      requireRowForm(
        async () => ROW,
        () => false,
        NOT_FOUND,
      ),
    )

    expect(isValidationError(error)).toBe(true)
    expect(error).toMatchObject({ issues: [{ message: DENIED }] })
  })
})

/** The app-admin gate. These handlers read through the privileged client with no policy under
 *  them, so this check is all that stands between a signed-in non-admin and every region. */
describe('requireAppAdmin', () => {
  it('lets an app admin through', () => {
    expect(() => requireAppAdmin([APP_PERMISSION_ADMIN])).not.toThrow()
  })

  it('403s a caller with no permissions at all', async () => {
    const error = await thrown(async () => requireAppAdmin(undefined))

    expect(isHttpError(error)).toBe(true)
    expect(error).toMatchObject({ body: { message: DENIED }, status: 403 })
  })

  it('403s a caller holding some other permission', async () => {
    // A region permission is not an app permission, however many the caller holds.
    const error = await thrown(async () => requireAppAdmin([REGION_PERMISSION_READ]))

    expect(isHttpError(error)).toBe(true)
    expect(error).toMatchObject({ body: { message: DENIED }, status: 403 })
  })
})
