import { beforeEach, describe, expect, it, vi } from 'vitest'

const reportIfOnline = vi.fn()
vi.mock('$lib/logging/report', () => ({ reportIfOnline }))

const { notifyError } = await import('./toast')

describe('notifyError', () => {
  beforeEach(() => {
    reportIfOnline.mockClear()
  })

  // The failures that reach the reader as "Something went wrong" are the ones nothing else records.
  it.each([
    ['an unauthored error', new TypeError('Registration failed')],
    ['a bare catch', undefined],
    ['a rejection with no body', { status: 500 }],
  ])('reports %s', (_label, cause) => {
    notifyError(cause)

    expect(reportIfOnline).toHaveBeenCalledWith(cause)
  })

  // The app refusing on purpose is not an incident, and logging it would bury the ones above.
  it('does not report a server-authored refusal', () => {
    notifyError({ body: { message: 'region_nameTaken' }, status: 400 })

    expect(reportIfOnline).not.toHaveBeenCalled()
  })
})
