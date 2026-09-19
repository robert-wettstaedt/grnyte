import type { MediaFile, VideoReadiness } from '$lib/entities/file/dto'
import { isOnline } from '$lib/state/online.svelte'
import { isVisible } from '$lib/state/visible.svelte'
import { bunnyHls, bunnyIframe, bunnyPreview, bunnyThumbnail } from './bunny'
import { isObservedReady, probeUntilReady } from './observed.svelte'

/** How far a tile has fallen back through the host's derivatives. */
export type DerivativeStage = 'missing' | 'preview' | 'thumbnail'

/** What a surface may show for one video right now. `undefined` means the file is not a video. */
export type VideoView =
  | undefined
  | { guid: string; kind: 'preparing' }
  | { hls: string; iframe: string; kind: 'playable'; poster: string; preview: string }
  | { kind: 'unavailable' }

/** Which branch a surface draws, before the URLs are attached. */
type TileState = 'media' | 'preparing' | 'unavailable'

/**
 * The next derivative to try after one 404s: preview, then poster, then give up.
 *
 * Here rather than in a component because it is the host's ladder, not a tile's: this seam owns
 * which URLs exist and the order to try them, while whether any one of them loaded is the element's
 * own business. `missing` is a real state, because a video is playable (webhook status 4) before
 * its preview and poster exist.
 */
export function nextDerivativeStage(stage: DerivativeStage): DerivativeStage {
  return stage === 'preview' ? 'thumbnail' : 'missing'
}

/**
 * What this client may show for a video right now: the synced readiness, this client's own
 * observation, and the URLs, answered once.
 *
 * The client counterpart of `videos/provider.server.ts`. Five surfaces used to derive this
 * separately and one of them, the share sheet, never folded in the observation, so a video the
 * reader had already watched still warned that its link would not play. The override lives in here
 * for that reason: a caller cannot forget what it cannot reach.
 *
 * Reactive. Reading it registers a dependency on the observed set, so call it inside `$derived`.
 * The return value is a FRESH object every call, and a miss on the set subscribes to its version,
 * so any video being promoted anywhere re-creates it. Never key an effect or an `{@attach}` on it:
 * derive the string you need and key on that, or a playing video restarts.
 */
export function videoView(file: MediaFile): VideoView {
  const guid = file.bunnyStreamFk
  if (guid == null) {
    return undefined
  }
  switch (tileState(file.readiness, isObservedReady(guid))) {
    case 'preparing':
      return { guid, kind: 'preparing' }
    case 'unavailable':
      return { kind: 'unavailable' }
    default:
      return {
        hls: bunnyHls(guid),
        iframe: bunnyIframe(guid),
        kind: 'playable',
        poster: bunnyThumbnail(guid),
        preview: bunnyPreview(guid),
      }
  }
}

/**
 * Poll the host until a pending video is watchable, for as long as it is worth polling.
 *
 * Call it once during a component's init. Paused while the tab is hidden or the app is offline: a
 * forgotten tab would poll the CDN for the whole encode, and offline every failure looks the same
 * as still encoding.
 *
 * The effect depends on the GUID, never on the view: `videoView` returns a fresh object every call
 * and a miss on the observed set subscribes to its version, so an effect keyed on the object
 * restarts the probe whenever any video anywhere is promoted.
 */
export function watchReadiness(file: () => MediaFile): void {
  const guid = $derived.by(() => {
    const view = videoView(file())
    return view?.kind === 'preparing' ? view.guid : undefined
  })

  $effect(() => {
    if (guid == null || !isVisible() || !isOnline()) {
      return
    }
    return probeUntilReady(guid)
  })
}

/**
 * Private: the interface above is the test surface, so no caller can reach this and skip the
 * observation. An observation only ever promotes, so it cannot contradict the record.
 *
 * An absent readiness reads as playable, which is what `dto.ts` documents. It means the `files` row
 * is local before its `bunnyStream` row, a window measured in milliseconds, not a fourth state.
 */
function tileState(readiness: undefined | VideoReadiness, observedReady: boolean): TileState {
  if (observedReady) {
    return 'media'
  }
  if (readiness === 'pending') {
    return 'preparing'
  }
  return readiness === 'failed' ? 'unavailable' : 'media'
}
