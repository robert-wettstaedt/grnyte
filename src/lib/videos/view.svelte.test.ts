import type { MediaFile, VideoReadiness } from '$lib/entities/file/dto'
import { flushSync } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeUntilReady } from './observed.svelte'
import { nextDerivativeStage, videoView, watchReadiness, type DerivativeStage } from './view.svelte'

vi.mock('$env/static/public', () => ({
  PUBLIC_BUNNY_STREAM_HOSTNAME: 'vz-test.b-cdn.net',
  PUBLIC_BUNNY_STREAM_LIBRARY_ID: '383888',
}))

// `isOnline()` answers false under test: it starts pessimistic until its own probe confirms, and
// there is nothing here for it to reach. Left real, every assertion below would pass with the gate
// shut for the wrong reason.
const gate = vi.hoisted(() => ({ online: true }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => gate.online }))

/** The observed set is module-level and outlives a case, so each one needs its own guid. */
const freshGuid = () => `guid-${Math.random().toString(36).slice(2)}`

const file = (readiness: undefined | VideoReadiness, guid: string | undefined): MediaFile => ({
  ascentCreatedBy: undefined,
  bunnyStreamFk: guid,
  createdAt: 0,
  height: undefined,
  id: 'file',
  path: guid == null ? 'photo.jpg' : '',
  readiness,
  regionFk: 1,
  source: undefined,
  uploader: undefined,
  visibility: 'private',
  width: undefined,
})

/** Put a guid in the observed set the way the probe does, rather than by reaching into it. */
const observe = async (guid: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )
  const stop = probeUntilReady(guid)
  await vi.waitFor(() => expect(videoView(file('pending', guid))?.kind).toBe('playable'))
  stop()
}

describe('videoView', () => {
  it('is undefined for an image, so a caller need not ask isVideo first', () => {
    expect(videoView(file(undefined, undefined))).toBeUndefined()
  })

  it('is preparing for a pending video, and carries the guid the probe needs', () => {
    const guid = freshGuid()
    expect(videoView(file('pending', guid))).toEqual({ guid, kind: 'preparing' })
  })

  it('is unavailable for a failed video, and carries no URLs to show', () => {
    expect(videoView(file('failed', freshGuid()))).toEqual({ kind: 'unavailable' })
  })

  it('is playable for a ready video, with all four host URLs', () => {
    const guid = freshGuid()
    const view = videoView(file('ready', guid))
    expect(view).toMatchObject({
      hls: `https://vz-test.b-cdn.net/${guid}/playlist.m3u8`,
      iframe: `https://iframe.mediadelivery.net/embed/383888/${guid}?autoplay=true`,
      kind: 'playable',
      poster: `https://vz-test.b-cdn.net/${guid}/thumbnail.jpg`,
      preview: `https://vz-test.b-cdn.net/${guid}/preview.webp`,
    })
  })

  // The Zero sync window: the `files` row is local before its `bunnyStream` row. Two surfaces used
  // to read this as "not showable" and disagree with the other two.
  it('is playable when readiness has not synced yet', () => {
    expect(videoView(file(undefined, freshGuid()))?.kind).toBe('playable')
  })

  // The defect the seam exists for. Before this, the share sheet read the record alone and warned
  // that a video the reader had already watched would not play.
  it('is playable once this client has observed the playlist, though the record still says pending', async () => {
    const guid = freshGuid()
    expect(videoView(file('pending', guid))?.kind).toBe('preparing')
    await observe(guid)
    expect(videoView(file('pending', guid))?.kind).toBe('playable')
  })

  // Promote-only, as a property over every readiness rather than one example of it. An observation
  // must never move a surface INTO a non-playable state.
  it.each(['failed', 'ready', undefined] as const)('stays playable for %s once observed', async (readiness) => {
    const guid = freshGuid()
    await observe(guid)
    expect(videoView(file(readiness, guid))?.kind).toBe('playable')
  })
})

describe('nextDerivativeStage', () => {
  it('falls from the preview to the poster', () => {
    expect(nextDerivativeStage('preview')).toBe('thumbnail')
  })

  // Not a third attempt and not a broken <img>: status 4 makes a video playable before its
  // derivatives exist, so this is the normal path rather than an error.
  it('gives up after the poster rather than retrying', () => {
    expect(nextDerivativeStage('thumbnail')).toBe('missing')
  })

  // Pinned directly: the loop below lands on `missing` after 5 steps even when `missing` walks
  // back to `preview`, so it cannot catch that regression on its own.
  it('stays given up', () => {
    expect(nextDerivativeStage('missing')).toBe('missing')
  })

  it('always terminates', () => {
    let stage: DerivativeStage = 'preview'
    for (let i = 0; i < 5; i++) stage = nextDerivativeStage(stage)
    expect(stage).toBe('missing')
  })
})

// The gate only became testable when it moved out of the two components. The regression it guards
// against is silent: a hidden tab keeps polling the CDN and nothing on screen looks wrong.
describe('watchReadiness', () => {
  const visibility = (state: 'hidden' | 'visible') => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    document.dispatchEvent(new Event('visibilitychange'))
  }

  afterEach(() => {
    gate.online = true
    vi.restoreAllMocks()
    document.dispatchEvent(new Event('visibilitychange'))
    vi.unstubAllGlobals()
  })

  /** Mount the watcher the way a component does, and report what it asked the host for. */
  const watch = (readiness: undefined | VideoReadiness, guid: string) => {
    const asked: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url)
        return new Response(null, { status: 404 })
      }),
    )
    const stop = $effect.root(() => watchReadiness(() => file(readiness, guid)))
    flushSync()
    return { asked, stop }
  }

  it('probes a pending video while the document is on screen', () => {
    visibility('visible')
    const { asked, stop } = watch('pending', freshGuid())
    expect(asked.length).toBeGreaterThan(0)
    stop()
  })

  it('does not probe while the document is hidden', () => {
    visibility('hidden')
    const { asked, stop } = watch('pending', freshGuid())
    expect(asked).toEqual([])
    stop()
  })

  it('leaves a video alone that is not pending', () => {
    visibility('visible')
    const { asked, stop } = watch('ready', freshGuid())
    expect(asked).toEqual([])
    stop()
  })

  // The other half of the gate. Offline, every failure looks the same as still encoding.
  it('does not probe while the app is offline', () => {
    visibility('visible')
    gate.online = false
    const { asked, stop } = watch('pending', freshGuid())
    expect(asked).toEqual([])
    stop()
  })
})
