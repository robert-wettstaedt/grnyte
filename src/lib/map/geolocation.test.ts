import type OlMap from 'ol/Map.js'
import View from 'ol/View.js'
import { afterEach, expect, it, vi } from 'vitest'
import { setupGeolocation } from './geolocation'

afterEach(() => vi.unstubAllGlobals())

it('does not start a watch when cleanup ran before the permission answered', async () => {
  let resolve!: (status: PermissionStatus) => void
  const watch = vi.fn(() => 1)
  vi.stubGlobal('navigator', {
    geolocation: { clearWatch: vi.fn(), watchPosition: watch },
    permissions: { query: () => new Promise((r) => (resolve = r)) },
  })

  const cleanup = setupGeolocation({ addOverlay() {}, getView: () => new View(), set() {} } as unknown as OlMap, {
    onFix: () => {},
    onFollowEnded: () => {},
    setError: () => {},
  })
  cleanup()
  resolve({ state: 'granted' } as PermissionStatus)
  await Promise.resolve()
  await Promise.resolve()

  expect(watch).not.toHaveBeenCalled()
})
