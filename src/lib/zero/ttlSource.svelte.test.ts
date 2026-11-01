import { flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { queries } from './queries'
import { createResource } from './resource.svelte'
import { ttlSource, type TtlClient } from './ttlSource.svelte'

/** A Zero client reduced to `materialize`, whose one view a test feeds by hand. */
function fakeClient() {
  let listener: ((data: unknown, type: 'cached' | 'complete' | 'error' | 'unknown') => void) | undefined
  const view = {
    addListener: vi.fn((next: typeof listener) => {
      listener = next
      return () => (listener = undefined)
    }),
    data: [],
    destroy: vi.fn(),
    updateTTL: vi.fn(),
  }
  const materialize = vi.fn(() => view)
  const client = { context: {}, current: { materialize } } as unknown as TtlClient
  return { client, emit: (data: unknown, type: 'complete' | 'unknown') => listener?.(data, type), materialize, view }
}

describe('ttlSource', () => {
  it('materializes with its TTL, passes rows on, and destroys the view when nothing reads it', () => {
    const fake = fakeClient()
    let query!: ReturnType<ReturnType<typeof ttlSource>['createQuery']>
    const cleanup = $effect.root(() => {
      query = ttlSource('none', () => fake.client).createQuery(queries.listGrades(), true)
      $effect(() => query.view?.ensureSubscribed())
    })
    flushSync()
    expect(fake.materialize).toHaveBeenCalledWith(expect.anything(), { ttl: 'none' })

    fake.emit([{ id: 1 }], 'complete')
    expect(query.data).toEqual([{ id: 1 }])
    expect(query.details).toEqual({ type: 'complete' })

    cleanup()
    flushSync()
    expect(fake.view.destroy).toHaveBeenCalledOnce()
  })

  it('through a resource, swaps views when the request changes without showing the empty default', () => {
    // As Zero's views do, each one answers its listener synchronously with what it holds.
    const views: { destroy: ReturnType<typeof vi.fn> }[] = []
    const materialize = vi.fn((_query: unknown, _opts: unknown) => {
      const rows = [{ id: views.length + 1 }]
      const view = {
        addListener: (next: (data: unknown, type: 'complete') => void) => {
          next(rows, 'complete')
          return () => {}
        },
        data: rows,
        destroy: vi.fn(),
        updateTTL: vi.fn(),
      }
      views.push(view)
      return view
    })
    const client = { context: {}, current: { materialize } } as unknown as TtlClient
    const size = $state({ value: 1 })
    const seen: unknown[] = []
    const cleanup = $effect.root(() => {
      const resource = createResource(
        () => queries.listRoutes({ pageSize: size.value }),
        (rows) => rows,
        { source: ttlSource('none', () => client) },
      )
      $effect(() => {
        seen.push(resource.data)
      })
    })
    flushSync()
    size.value = 2
    flushSync()
    expect(materialize).toHaveBeenCalledTimes(2)
    expect(views[0].destroy).toHaveBeenCalledOnce()
    expect(seen).toEqual([[{ id: 1 }], [{ id: 2 }]])
    cleanup()
  })

  it('never materializes a disabled query', () => {
    const fake = fakeClient()
    const cleanup = $effect.root(() => {
      const query = ttlSource('none', () => fake.client).createQuery(queries.listGrades(), false)
      $effect(() => query.view?.ensureSubscribed())
    })
    flushSync()
    expect(fake.materialize).not.toHaveBeenCalled()
    cleanup()
  })
})
