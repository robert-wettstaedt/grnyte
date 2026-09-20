import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendResume, clearResumeLog, readResumeLog, recordResume, type ResumeEntry } from './resumeLog'

const entry = (at: number): ResumeEntry => ({ at, elapsedMs: at * 10 })

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('appendResume', () => {
  it('keeps the newest entry last', () => {
    expect(appendResume([entry(1)], entry(2)).map((e) => e.at)).toEqual([1, 2])
  })

  it('drops the oldest once the cap is reached', () => {
    const full = [entry(1), entry(2), entry(3)]
    expect(appendResume(full, entry(4), 3).map((e) => e.at)).toEqual([2, 3, 4])
  })

  it('does not mutate what it was given', () => {
    const before = [entry(1)]
    appendResume(before, entry(2), 3)
    expect(before.map((e) => e.at)).toEqual([1])
  })
})

describe('the stored log', () => {
  it('round-trips through storage', () => {
    recordResume(entry(1))
    recordResume(entry(2))
    expect(readResumeLog().map((e) => e.at)).toEqual([1, 2])
  })

  it('clears', () => {
    recordResume(entry(1))
    clearResumeLog()
    expect(readResumeLog()).toEqual([])
  })

  // The key is derived the way the module derives it. Hardcoding a guess made this pass by reading
  // a key nothing had written, which is a green test asserting nothing.
  it('ignores anything in storage that is not an entry', () => {
    const key = `${PUBLIC_APPLICATION_NAME}.resumeLog`
    localStorage.setItem(key, '{"not":"an array"}')
    expect(readResumeLog()).toEqual([])

    localStorage.setItem(key, '[{"at":1},{"at":2,"elapsedMs":20}]')
    expect(readResumeLog().map((e) => e.at)).toEqual([2])
  })
})

// A diagnostic must never be the thing that breaks the app. Private windows and blocked site data
// make every one of these throw rather than return null.
describe('when storage throws', () => {
  it('reads as empty rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })

    expect(() => readResumeLog()).not.toThrow()
    expect(readResumeLog()).toEqual([])
  })

  it('swallows a failed write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota')
    })

    expect(() => recordResume(entry(1))).not.toThrow()
  })

  it('swallows a failed clear', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied')
    })

    expect(() => clearResumeLog()).not.toThrow()
  })
})
