<!--
  What a media tile LOOKS like, with no tap of its own: the aspect box, a video's three states, the
  poster ladder and the readiness probe. Split out of MediaThumbnail so a caller already inside a
  link (the inbox row) draws the same tile without nesting a button in an anchor.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Image from '$lib/components/Image/Image.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import type { DerivativeSize } from '$lib/images/derivatives'
  import { m } from '$lib/paraglide/messages'
  import { nextDerivativeStage, videoView, watchReadiness, type DerivativeStage } from '$lib/videos/view.svelte'
  import type { Snippet } from 'svelte'
  import type { ClassValue } from 'svelte/elements'
  import { MediaQuery } from 'svelte/reactivity'
  import { fade } from 'svelte/transition'

  /** One delayed retry of the derivative ladder, long enough for the host to have generated them. */
  const DERIVATIVE_RETRY_MS = 60_000

  interface Props {
    /** Overlays drawn inside the tile's own positioned box, e.g. the uploader badge. */
    children?: Snippet
    /** Extra tile classes: the caller sets the height here; width follows the aspect ratio. */
    class?: ClassValue
    /** Drop the placeholder captions to icon-only, for a tile too short to fit two lines. The
     *  caller's own label carries the wording. */
    compact?: boolean
    file: MediaFile
    /** Which derivative to load. Defaults to the small one: pass 1024 only for tiles big
     *  enough that 256 would look soft on a retina screen. */
    previewWidth?: DerivativeSize
  }

  const { children, class: className, compact = false, file, previewWidth = 256 }: Props = $props()

  const isVideo = $derived(file.bunnyStreamFk != null)
  // Known image dimensions pin the tile's aspect ratio so it doesn't shift on
  // load. Videos carry no dimensions in our data, so their preview flows at its
  // natural size (a square fallback covers a dimensionless image).
  const ratio = $derived(file.width && file.height ? `${file.width} / ${file.height}` : '1 / 1')

  const view = $derived(videoView(file))
  const preparing = $derived(view?.kind === 'preparing')
  const unavailable = $derived(view?.kind === 'unavailable')

  watchReadiness(() => file)

  // Bunny's animated WebP, degrading preview.webp to thumbnail.jpg. Readiness answers whether the
  // video is there, so this no longer retries on a timer. A video is playable before its
  // derivatives exist, so the last stage is a placeholder, never a broken-image glyph.
  let videoStage = $state<DerivativeStage>('preview')
  const videoSrc = $derived(
    view?.kind !== 'playable' ? undefined : videoStage === 'thumbnail' ? view.poster : view.preview,
  )
  const onVideoError = () => (videoStage = nextDerivativeStage(videoStage))

  // The ladder is terminal, and both derivatives 404 in the window where a video is playable but
  // its preview and poster do not exist yet, so without this the tile keeps the placeholder until
  // something remounts it. One retry, not a timer: if they are still missing a minute later they
  // are not coming, and a timer is what readiness replaced.
  let retried = $state(false)
  $effect(() => {
    if (videoStage !== 'missing' || retried) {
      return
    }
    const timer = setTimeout(() => {
      retried = true
      videoStage = 'preview'
    }, DERIVATIVE_RETRY_MS)
    return () => clearTimeout(timer)
  })

  // Bunny renders the animated preview on a fixed 16:9 canvas, so a portrait clip
  // comes back pillarboxed with black bars. The still thumbnail keeps the source's
  // real aspect, so probe it, size the tile to it, and object-cover the preview so
  // those baked-in bars get cropped instead of shown.
  let videoRatio = $state<string>()
  const onProbe = (event: Event) => {
    const { naturalHeight: h, naturalWidth: w } = event.currentTarget as HTMLImageElement
    if (w > 0 && h > 0) videoRatio = `${w} / ${h}`
  }

  // A Svelte transition ignores the preference on its own, unlike the CSS in app.css.
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)
</script>

<!-- Height comes from the caller; aspect-ratio drives the width so every tile is the
     same height with its own proportions. -->
<div
  class={['bg-surface-950 relative shrink-0 overflow-hidden rounded-lg', className]}
  style:aspect-ratio={isVideo ? (videoRatio ?? '16 / 9') : ratio}
>
  {#if isVideo}
    {#if preparing}
      <!-- Still encoding. -->
      <div
        class="bg-surface-200-800 text-surface-600-400 flex h-full animate-pulse flex-col items-center justify-center gap-1"
      >
        <Icon name="hourglass" size={24} />
        {#if !compact}
          <span class="px-1 text-center text-[0.65rem] leading-tight font-medium">{m.media_preparing()}</span>
        {/if}
      </div>
    {:else if unavailable}
      <div class="bg-surface-200-800 text-surface-500 flex h-full flex-col items-center justify-center gap-1">
        <Icon name="image-off" size={24} />
        {#if !compact}
          <span class="px-1 text-center text-[0.65rem] leading-tight font-medium">{m.media_unavailable()}</span>
        {/if}
      </div>
    {:else}
      <div class="h-full w-full" transition:fade={{ duration }}>
        {#if view?.kind === 'playable'}
          <img src={view.poster} alt="" class="hidden" onload={onProbe} />
        {/if}
        {#if videoStage === 'missing'}
          <!-- Playable, but the host has no poster yet, and the tap does work. -->
          <div class="bg-surface-200-800 text-surface-500 flex h-full items-center justify-center">
            <Icon name="play" size={32} fill="currentColor" />
          </div>
        {:else}
          <img
            class="pointer-events-none block h-full w-full object-cover select-none"
            src={videoSrc}
            alt=""
            loading="lazy"
            onerror={onVideoError}
          />
        {/if}
      </div>
    {/if}
  {:else}
    <Image path={file.path} alt="" class="h-full w-full" imgClass="pointer-events-none select-none" {previewWidth} />
  {/if}

  {@render children?.()}
</div>
