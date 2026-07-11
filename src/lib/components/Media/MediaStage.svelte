<!--
  The per-file media surface: image (thumbnail-first) or video (adaptive HLS with an
  iframe fallback), plus pinch/zoom. Mounted under a `{#key file.id}` by the viewer so
  paging to a sibling starts every bit of this state fresh. Swipe/dismiss gestures live
  in the viewer's deck (which reads `onZoomChange` to stay out of the way while zoomed).
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { panzoom } from '$lib/components/Topo/panzoom'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { bunnyHls, bunnyIframe } from '$lib/videos/bunny'
  import type Hls from 'hls.js'
  import type { Attachment } from 'svelte/attachments'

  interface Props {
    file: MediaFile
    /** Reports the live zoom factor (1 = fit) so the deck can gate its swipe gestures. */
    onZoomChange?: (scale: number) => void
    /** Reports when the video dropped to the iframe fallback, a cross-origin frame that
     *  swallows touch, so the deck surfaces its arrow buttons (swipe can't reach it). */
    onFallback?: (active: boolean) => void
  }

  const { file, onZoomChange, onFallback }: Props = $props()

  const guid = $derived(file.bunnyStreamFk)
  const isVideo = $derived(guid != null)

  // Caption timestamp: relative ("3 days ago") within a week, absolute date beyond it.
  // Tapping swaps it to the exact date + time; hover shows the same via `title`.
  const uploadedRelative = $derived(formatUploadedAt(file.createdAt, Date.now(), getLocale()))
  const uploadedExact = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeStyle: 'short' }).format(file.createdAt),
  )
  const uploadedIso = $derived(new Date(file.createdAt).toISOString())
  let showExact = $state(false)

  // Aspect (w/h) feeds panzoom's letterbox clamp. Images carry their EXIF-oriented
  // size on the row, so the fit is known before a byte loads; videos report theirs
  // once stream metadata arrives. Both fall back to the loaded natural size.
  let naturalWidth = $state(0)
  let naturalHeight = $state(0)
  let videoWidth = $state(0)
  let videoHeight = $state(0)
  const aspect = $derived.by(() => {
    const w = isVideo ? videoWidth : file.width || naturalWidth
    const h = isVideo ? videoHeight : file.height || naturalHeight
    return w > 0 && h > 0 ? w / h : undefined
  })

  // Image, thumbnail-first: the grid already fetched (and cached) the 512px preview,
  // so it paints instantly while the 1024 derivative streams in behind the spinner
  // and cross-fades over it. The untouched original (often several MB on a crag
  // connection) only streams once the user actually zooms in.
  const cleanPath = $derived(file.path.replace(/^\/+/, ''))
  let wantFull = $state(false)
  const fullSrc = $derived(`/image/${cleanPath}${wantFull ? '' : '?w=1024'}`)
  let fullLoaded = $state(false)
  let fullFailed = $state(false)
  // A failed original drops back to the 1024 derivative; a failed derivative
  // leaves the 512 layer standing and stops the spinner (no endless "loading").
  const onFullError = () => {
    if (wantFull) {
      wantFull = false
    } else {
      fullFailed = true
    }
  }

  // Adaptive HLS with an iframe fallback. Safari plays HLS natively; elsewhere hls.js
  // drives it. A fatal error means it can't play here: a decode glitch gets one in-place
  // recovery, but anything else (a 404 manifest for a missing or still-encoding video, an
  // unrecoverable network fault) drops to the iframe, which renders Bunny's own state and
  // plays whenever the video actually exists. (Retrying a missing manifest via startLoad
  // never recovers and, in Firefox, silently stalls on an empty player.) We own the play()
  // promise so an aborted autoplay (a failed source, or teardown detaching the media) is
  // swallowed instead of surfacing as an uncaught DOMException.
  let videoFailed = $state(false)
  // Tell the deck when we're on the iframe fallback so it can offer arrow navigation.
  $effect(() => {
    onFallback?.(videoFailed)
  })

  const hlsVideo =
    (url: string): Attachment<HTMLVideoElement> =>
    (video) => {
      const play = () => void video.play().catch(() => {})

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari): the element's own error event is the only failure
        // signal here, and it means the source can't play, so drop to the iframe.
        video.src = url
        const onError = () => (videoFailed = true)
        video.addEventListener('error', onError)
        play()
        // Pause on teardown (as the hls.js branch does) so a detaching element can't
        // keep playing audio after the viewer closes on Safari.
        return () => {
          video.pause()
          video.removeEventListener('error', onError)
        }
      }
      // hls.js is half a megabyte that Safari and image-only visits never need,
      // so it loads on demand right here instead of riding the page chunk.
      let hls: Hls | undefined
      let done = false
      const fail = () => {
        if (done) return
        done = true
        hls?.destroy()
        videoFailed = true
      }
      void import('hls.js').then(({ default: HlsLib }) => {
        if (done) return
        if (!HlsLib.isSupported()) {
          videoFailed = true
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

  // `paused` reflects the element's own play/pause events (one-way); playback is driven
  // imperatively via togglePlay so every play() is ours to catch. Svelte's two-way
  // bind:paused would instead fire an uncaught play() (on mount, and it fights our
  // autoplay) that rejects when teardown detaches the media: the DOMException on close.
  let videoEl = $state<HTMLVideoElement>()
  let paused = $state(true)
  let muted = $state(true)
  let currentTime = $state(0)
  let duration = $state(0)

  const togglePlay = () => {
    const video = videoEl
    if (video == null || videoFailed) return
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }

  const formatTime = (s: number) => {
    if (!Number.isFinite(s)) return '0:00'
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // A click (mouse) or a tap that never turned into a drag toggles playback. Added as a
  // listener (not an inline handler) so the media stays a plain non-interactive surface;
  // the footer's play button is the keyboard-accessible equivalent.
  const clickToTogglePlay: Attachment<HTMLElement> = (node) => {
    node.addEventListener('click', togglePlay)
    return () => node.removeEventListener('click', togglePlay)
  }

  // Legacy rows can hold a non-URL source (the z.url() validation arrived later);
  // render the credit only when it parses instead of crashing the whole stage.
  const sourceHost = $derived.by(() => {
    if (!file.source) return undefined
    try {
      return new URL(file.source).hostname
    } catch {
      return undefined
    }
  })

  const btn = 'btn preset-glass-neutral btn-lg h-12 w-12 shrink-0 px-0'
</script>

{#if isVideo && videoFailed}
  <iframe
    class="absolute inset-0 h-full w-full"
    src={bunnyIframe(guid!)}
    title={m.common_playVideo()}
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen
  ></iframe>
{:else}
  <div
    class="absolute inset-0 overflow-hidden"
    use:panzoom={{
      enabled: true,
      aspect,
      onZoom: (k) => {
        // First zoom-in is the signal to stream the true original.
        if (k > 1) wantFull = true
        onZoomChange?.(k)
      },
    }}
    {@attach clickToTogglePlay}
  >
    {#if isVideo}
      <video
        bind:this={videoEl}
        {@attach hlsVideo(bunnyHls(guid!))}
        class="h-full w-full object-contain"
        playsinline
        bind:muted
        bind:currentTime
        bind:duration
        bind:videoWidth
        bind:videoHeight
        onplay={() => (paused = false)}
        onpause={() => (paused = true)}
        onended={() => (paused = true)}
      ></video>
    {:else}
      <!-- Both layers ride the same panzoom child so they zoom/pan together. -->
      <div class="relative h-full w-full">
        <img
          src={`/image/${cleanPath}?w=512`}
          alt=""
          class="pointer-events-none absolute inset-0 h-full w-full object-contain select-none"
        />
        <img
          src={fullSrc}
          alt=""
          class={[
            'pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300 select-none',
            !fullLoaded && 'opacity-0',
          ]}
          bind:naturalWidth
          bind:naturalHeight
          onload={() => (fullLoaded = true)}
          onerror={onFullError}
        />
      </div>
    {/if}
  </div>

  {#if !isVideo && !fullLoaded && !fullFailed}
    <!-- The display-res image is still streaming in behind the cached thumbnail. -->
    <div
      class="pointer-events-none absolute inset-0 grid place-items-center"
      role="status"
      aria-label={m.media_loading()}
    >
      <div class="size-10 animate-spin rounded-full border-[3px] border-white/30 border-t-white"></div>
    </div>
  {/if}
{/if}

<!-- Bottom caption + (for videos) transport, over the media. The caption is the
     Reels-style attribution slot: uploader + upload date now (source folded in for
     videos); ascent notes will extend it here later, collapsed then into a sheet.
     Hidden only over the raw iframe fallback, which renders its own chrome. -->
{#if !(isVideo && videoFailed)}
  <footer class="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-linear-to-t from-black/70 to-transparent p-3">
    <div class="flex flex-col gap-1.5">
      {#if file.uploader}
        <div class="flex items-center gap-2">
          <a
            href={resolve('/(app)/users/[id]', { id: String(file.uploader.id) })}
            class="flex items-center gap-2 hover:opacity-80"
          >
            <Avatar name={file.uploader.username} size={28} solid />
            <span class="text-sm font-semibold">{file.uploader.username}</span>
          </a>
          <span class="opacity-50">·</span>
          <button
            type="button"
            class="text-xs opacity-80"
            title={uploadedExact}
            onclick={() => (showExact = !showExact)}
          >
            <time datetime={uploadedIso}>{showExact ? uploadedExact : uploadedRelative}</time>
          </button>
        </div>
      {/if}

      {#if sourceHost != null}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- external origin URL, not an app route -->
        <a href={file.source} target="_blank" rel="noopener noreferrer" class="self-start text-sm underline opacity-80">
          {m.media_source()}: {sourceHost}
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/if}
    </div>

    {#if isVideo}
      <div class="flex items-center gap-3">
        <button type="button" class={btn} aria-label={paused ? m.media_play() : m.media_pause()} onclick={togglePlay}>
          <Icon name={paused ? 'play' : 'pause'} size={20} fill="currentColor" />
        </button>

        <input
          type="range"
          class="min-w-0 flex-1"
          min="0"
          max={duration || 0}
          step="0.1"
          aria-label={m.media_seek()}
          bind:value={currentTime}
        />

        <span class="shrink-0 text-xs whitespace-nowrap tabular-nums opacity-80">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <button
          type="button"
          class={btn}
          aria-label={muted ? m.media_unmute() : m.media_mute()}
          onclick={() => (muted = !muted)}
        >
          <Icon name={muted ? 'volume-off' : 'volume-1'} size={20} />
        </button>
      </div>
    {/if}
  </footer>
{/if}
