import type Hls from 'hls.js'
import type { Attachment } from 'svelte/attachments'

/**
 * Adaptive HLS playback for a Bunny Stream `<video>`, with a caller-driven fallback.
 * Safari plays HLS natively; elsewhere hls.js drives it. A fatal error means it can't
 * play here: a decode glitch gets one in-place recovery, but anything else (a 404
 * manifest for a missing or still-encoding video, an unrecoverable network fault) calls
 * `onFail` so the caller can drop to Bunny's iframe embed, which renders its own state and
 * plays whenever the video actually exists. (Retrying a missing manifest via startLoad
 * never recovers and, in Firefox, silently stalls on an empty player.) We own the play()
 * promise so an aborted autoplay (a failed source, or teardown detaching the media) is
 * swallowed instead of surfacing as an uncaught DOMException.
 *
 * hls.js is hundreds of kilobytes that Safari and image-only visits never need, so it loads
 * on demand here rather than riding the page chunk.
 */
export const createHlsAttachment =
  (url: string, onFail: () => void): Attachment<HTMLVideoElement> =>
  (video) => {
    const play = () => void video.play().catch(() => {})

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari): the element's own error event is the only failure
      // signal here, and it means the source can't play, so drop to the fallback.
      video.src = url
      const onError = () => onFail()
      video.addEventListener('error', onError)
      play()
      // Pause on teardown (as the hls.js branch does) so a detaching element can't
      // keep playing audio after the viewer closes on Safari.
      return () => {
        video.pause()
        video.removeEventListener('error', onError)
      }
    }

    let hls: Hls | undefined
    let done = false
    const fail = () => {
      if (done) return
      done = true
      hls?.destroy()
      onFail()
    }
    // The `light` build is the same Hls class with seven controllers dropped (per hls.js's own
    // README): AudioStreamController + AudioTrackController (alternate audio renditions),
    // SubtitleStreamController + SubtitleTrackController (WebVTT subtitles), TimelineController
    // (CEA-608/708 closed captions), EMEController (DRM) and CmcdController, plus playlist
    // variable substitution. That is about a third of the download (hls.js 1.6.16, minified and
    // gzipped: 163 kB full, 108 kB light). None of them has a caller here: the app renders no
    // text tracks at all (no `<track>` element, nothing touching textTracks), and Bunny Stream
    // serves muxed video+audio variants with no alternate audio renditions, no DRM and no
    // EXT-X-DEFINE. A future beta-video feature that wants subtitles or captions has to move
    // this back to the full `hls.js`.
    //
    // hls.js declares no `types` condition on the ./light subpath export, so TypeScript can't
    // see it. The default export is the same class the root build exports, so the root
    // package's own types describe it exactly.
    // @ts-expect-error -- untyped subpath export, see above
    const loadHls = import('hls.js/light') as Promise<typeof import('hls.js')>
    void loadHls.then(({ default: HlsLib }) => {
      if (done) return
      if (!HlsLib.isSupported()) {
        onFail()
        return
      }
      hls = new HlsLib()
      let recovered = 0
      hls.on(HlsLib.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR && recovered++ < 1) hls!.recoverMediaError()
        else fail()
      })
      hls.on(HlsLib.Events.MANIFEST_PARSED, play)
      hls.loadSource(url)
      hls.attachMedia(video)
    })

    return () => {
      if (done) return
      done = true
      video.pause()
      hls?.destroy()
    }
  }
