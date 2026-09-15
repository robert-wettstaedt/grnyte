<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Image from '$lib/components/Image/Image.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import type { DerivativeSize } from '$lib/images/derivatives'
  import { m } from '$lib/paraglide/messages'
  import { openMedia } from '$lib/state/navigation.svelte'
  import { bunnyPreview, bunnyThumbnail } from '$lib/videos/bunny'
  import { onDestroy } from 'svelte'
  import type { ClassValue } from 'svelte/elements'

  interface Props {
    /** Badge ascent-owned files with the climber's avatar, linking beta to its ascent.
     *  Off where the row already names the climber (e.g. an ascent row's own strip). */
    badged?: boolean
    /** Extra tile classes: the grid sets the tile's height here; width follows the aspect ratio. */
    class?: ClassValue
    file: MediaFile
    /** Which derivative to load. Defaults to the small one: pass 1024 only for tiles big
     *  enough that 256 would look soft on a retina screen. */
    previewWidth?: DerivativeSize
  }

  const { badged = false, class: className, file, previewWidth = 256 }: Props = $props()

  const guid = $derived(file.bunnyStreamFk)
  const isVideo = $derived(guid != null)
  // Known image dimensions pin the tile's aspect ratio so it doesn't shift on
  // load. Videos carry no dimensions in our data, so their preview flows at its
  // natural size (a square fallback covers a dimensionless image).
  const ratio = $derived(file.width && file.height ? `${file.width} / ${file.height}` : '1 / 1')

  // Open the viewer through the URL so it earns its own history entry (the back
  // button closes it) and the open media is deep-linkable and shareable. The grid
  // owns the (single) viewer and reads this param.
  const openViewer = () => openMedia(file.id)

  // The video tile is Bunny's animated WebP; it degrades preview.webp →
  // thumbnail.jpg → a placeholder. A fresh upload 404s on both while Bunny is
  // still encoding (minutes), so the placeholder re-probes with backoff instead
  // of going terminal, and the tile comes alive the moment the derivatives
  // exist. ponytail: gives up after ~8 minutes (10 tries), a remount starts
  // over; push encode status through Zero if that ever hurts.
  let videoStage = $state<'failed' | 'preview' | 'thumbnail' | 'waiting'>('preview')
  let attempt = $state(0)
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(retryTimer))

  // A CDN 404 can carry cache headers, so each retry round asks with a fresh URL.
  const bust = (url: string) => (attempt === 0 ? url : `${url}?r=${attempt}`)
  const videoSrc = $derived(
    guid == null ? undefined : bust(videoStage === 'thumbnail' ? bunnyThumbnail(guid) : bunnyPreview(guid)),
  )
  const onVideoError = () => {
    if (videoStage === 'preview') {
      videoStage = 'thumbnail'
    } else if (attempt < 10) {
      videoStage = 'waiting'
      retryTimer = setTimeout(
        () => {
          attempt += 1
          videoStage = 'preview'
        },
        Math.min(60_000, 5_000 * 2 ** attempt),
      )
    } else {
      videoStage = 'failed'
    }
  }

  // Bunny renders the animated preview on a fixed 16:9 canvas, so a portrait clip
  // comes back pillarboxed with black bars. The still thumbnail keeps the source's
  // real aspect, so probe it, size the tile to it, and object-cover the preview so
  // those baked-in bars get cropped instead of shown.
  let videoRatio = $state<string>()
  const onProbe = (event: Event) => {
    const { naturalHeight: h, naturalWidth: w } = event.currentTarget as HTMLImageElement
    if (w > 0 && h > 0) videoRatio = `${w} / ${h}`
  }
</script>

<!-- Height comes from the grid; aspect-ratio drives the width so every tile is the
     same height with its own proportions. -->
<button
  type="button"
  class={['bg-surface-950 relative shrink-0 overflow-hidden rounded-lg', className]}
  style:aspect-ratio={isVideo ? (videoRatio ?? '16 / 9') : ratio}
  aria-label={isVideo ? m.common_playVideo() : m.media_openImage()}
  onclick={openViewer}
>
  {#if isVideo}
    {#if videoStage === 'failed' || videoStage === 'waiting'}
      <!-- 'waiting' is a still-encoding video: show a play tile, not a broken one. -->
      <div class="bg-surface-200-800 text-surface-500 flex h-full items-center justify-center">
        <Icon name={videoStage === 'failed' ? 'image-off' : 'play'} size={32} />
      </div>
    {:else}
      {#if guid != null}
        <img src={bust(bunnyThumbnail(guid))} alt="" class="hidden" onload={onProbe} />
      {/if}
      <img
        class="pointer-events-none block h-full w-full object-cover select-none"
        src={videoSrc}
        alt=""
        loading="lazy"
        onerror={onVideoError}
      />
    {/if}
  {:else}
    <Image path={file.path} alt="" class="h-full w-full" imgClass="pointer-events-none select-none" {previewWidth} />
  {/if}

  <!-- Ascent-owned media carries the climber's avatar, so the grid itself shows
       whose beta each tile is; route-level files stay plain. -->
  {#if badged && file.ascent != null && file.uploader != null}
    <span class="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full ring-2 ring-black/40">
      <Avatar name={file.uploader.username} size={22} solid />
    </span>
  {/if}
</button>
