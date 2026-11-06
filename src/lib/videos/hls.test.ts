import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHlsAttachment } from './hls'

const refused = (name: string) => Promise.reject(new DOMException('refused', name))

const stubVideo = (native: boolean, play: () => Promise<void>) =>
  Object.assign(document.createElement('video'), {
    canPlayType: () => (native ? 'maybe' : ''),
    muted: false,
    pause: vi.fn(),
    play: vi.fn(play),
  })

const hlsEvents: Record<string, () => void> = {}
vi.mock('hls.js/light', () => ({
  default: class {
    static ErrorTypes = { MEDIA_ERROR: 'media' }
    static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifestParsed' }
    static isSupported = () => true
    attachMedia() {}
    destroy() {}
    loadSource() {}
    on(event: string, handler: () => void) {
      hlsEvents[event] = handler
    }
  },
}))

const start = async (video: HTMLVideoElement, native: boolean) => {
  createHlsAttachment('https://cdn/x.m3u8', () => {})(video)
  if (!native) {
    await vi.waitFor(() => expect(hlsEvents.manifestParsed).toBeTypeOf('function'))
    hlsEvents.manifestParsed()
  }
  await vi.waitFor(() => expect(video.play).toHaveBeenCalled())
  await new Promise((settle) => setTimeout(settle))
}

beforeEach(() => {
  delete hlsEvents.manifestParsed
})

describe.each([
  ['native HLS', true],
  ['hls.js', false],
])('autoplay on %s', (_label, native) => {
  it('plays muted when the browser refuses sound', async () => {
    const play = vi.fn<() => Promise<void>>().mockImplementationOnce(() => refused('NotAllowedError'))
    play.mockResolvedValue(undefined)
    const video = stubVideo(native, play)

    await start(video, native)

    expect(video.muted).toBe(true)
    expect(video.play).toHaveBeenCalledTimes(2)
  })

  it('does not restart a video that teardown aborted', async () => {
    const video = stubVideo(native, () => refused('AbortError'))

    await start(video, native)

    expect(video.muted).toBe(false)
    expect(video.play).toHaveBeenCalledTimes(1)
  })
})
