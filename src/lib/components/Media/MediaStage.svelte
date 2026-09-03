<!--
  The per-file media surface: image (thumbnail-first) or video (adaptive HLS with an
  iframe fallback), plus pinch/zoom. Mounted under a `{#key file.id}` by the viewer so
  paging to a sibling starts every bit of this state fresh. Swipe/dismiss gestures live
  in the viewer's deck (which reads `onZoomChange` to stay out of the way while zoomed).
-->
<script lang="ts">
  import { browser } from '$app/environment'
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { panzoom } from '$lib/components/Topo/panzoom'
  import AscentType from '$lib/entities/ascent/AscentType.svelte'
  import ConditionsPill from '$lib/entities/ascent/ConditionsPill.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { sourceHost } from '$lib/entities/file/upload'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import { formatDay, formatUploadedAt } from '$lib/i18n/relativeTime'
  import { imageSrc } from '$lib/images/derivatives'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { now } from '$lib/state/now.svelte'
  import { bunnyHls, bunnyIframe } from '$lib/videos/bunny'
  import { createHlsAttachment } from '$lib/videos/hls'
  import type { Attachment } from 'svelte/attachments'

  interface Props {
    file: MediaFile
    /** Reports when the video dropped to the iframe fallback, a cross-origin frame that
     *  swallows touch, so the deck surfaces its arrow buttons (swipe can't reach it). */
    onFallback?: (active: boolean) => void
    /** Reports the live zoom factor (1 = fit) so the deck can gate its swipe gestures. */
    onZoomChange?: (scale: number) => void
  }

  const { file, onFallback, onZoomChange }: Props = $props()

  const global = getGlobalState()

  // Links target auth-gated (app) routes, so only render them for a signed-in viewer
  // (the standalone /f/<id> page injects an undefined user for anonymous visitors).
  const signedIn = $derived(global.user != null)

  const guid = $derived(file.bunnyStreamFk)
  const isVideo = $derived(guid != null)

  // Route context (name/grade/rating), shown by the share page; unset in the in-app viewer.
  const routeName = $derived(
    file.route == null ? '' : file.route.name.length === 0 ? m.common_unnamed() : file.route.name,
  )
  const routeHref = $derived(file.route == null ? '' : resolve('/(app)/routes/[id]', { id: String(file.route.id) }))

  // Reel-style ascent context: a tappable collapsed line (type, date, first line of
  // the note) that expands into a sheet with the whole ascent.
  let infoOpen = $state(false)
  const ascentHref = $derived(file.ascent == null ? '' : resolve('/(app)/ascents/[id]', { id: String(file.ascent.id) }))
  const ascentNotes = $derived(file.ascent?.notes.trim() ?? '')

  // Caption timestamp: relative ("3 days ago") within a week, absolute date beyond it.
  // Tapping swaps it to the exact date + time; hover shows the same via `title`.
  const uploadedRelative = $derived(formatUploadedAt(file.createdAt, now(), getLocale()))
  // $derived so the formatter is built once per locale rather than once per clock tick.
  const exactFormat = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeStyle: 'short' }))
  // Browser-only: this is a moment, and the zone that makes it readable is the reader's, which only
  // the browser knows. /f/<id> server-renders (it is outside the (app) layout's `ssr = false`), so
  // formatting it there would stamp the host's zone into the HTML and redraw it on hydration. Both
  // ways it shows (a hover title and a tap-to-swap) need a pointer anyway, so nothing is lost.
  const uploadedExact = $derived(browser ? exactFormat.format(file.createdAt) : '')
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

  // Image, thumbnail-first: the grid already fetched (and cached) the 256 derivative, so it
  // paints instantly while the 1024 one streams in behind the spinner and cross-fades over it.
  // The untouched original (often several MB on a crag connection) only streams once the user
  // zooms in. Both layers must name real derivative sizes for this to work at all.
  const cleanPath = $derived(file.path.replace(/^\/+/, ''))
  let wantFull = $state(false)
  const fullSrc = $derived(wantFull ? imageSrc(cleanPath) : imageSrc(cleanPath, 1024))
  let fullLoaded = $state(false)
  let fullFailed = $state(false)
  // A failed original drops back to the 1024 derivative; a failed derivative
  // leaves the thumbnail layer standing and stops the spinner (no endless "loading").
  const onFullError = () => {
    if (wantFull) {
      wantFull = false
    } else {
      fullFailed = true
    }
  }

  // Adaptive HLS with an iframe fallback (see createHlsAttachment): a fatal, unrecoverable
  // error flips videoFailed, dropping us to Bunny's iframe embed.
  let videoFailed = $state(false)
  // Tell the deck when we're on the iframe fallback so it can offer arrow navigation.
  $effect(() => {
    onFallback?.(videoFailed)
  })

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
  const host = $derived(sourceHost(file.source))

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
      aspect,
      enabled: true,
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
        {@attach createHlsAttachment(bunnyHls(guid!), () => (videoFailed = true))}
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
          src={imageSrc(cleanPath, 256)}
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
          <svelte:element
            this={signedIn ? 'a' : 'div'}
            href={signedIn ? resolve('/(app)/users/[id]', { id: String(file.uploader.id) }) : undefined}
            class={['flex items-center gap-2', signedIn && 'hover:opacity-80']}
          >
            <Avatar name={file.uploader.username} size={28} solid />
            <span class="text-sm font-semibold">{file.uploader.username}</span>
          </svelte:element>
          <span class="opacity-50">·</span>
          <button
            type="button"
            class="text-xs opacity-80"
            title={uploadedExact === '' ? undefined : uploadedExact}
            onclick={() => (showExact = !showExact)}
          >
            <time datetime={uploadedIso}>{showExact ? uploadedExact : uploadedRelative}</time>
          </button>
        </div>
      {/if}

      {#if file.route != null}
        <svelte:element
          this={signedIn ? 'a' : 'div'}
          href={signedIn ? routeHref : undefined}
          class={['flex flex-wrap items-center gap-2', signedIn && 'hover:opacity-80']}
        >
          <span class="text-sm font-semibold">{routeName}</span>
          <RouteGrade
            band={getGradeBand(file.route.gradeFk)}
            grade={gradeLabel(global.grades, global.gradingScale, file.route.gradeFk)}
          />
          <RouteRating rating={file.route.rating} />
        </svelte:element>
      {/if}

      <!-- Beta context: this file hangs on an ascent, not on the route itself. The
           collapsed line is the trigger; the sheet holds the whole ascent. -->
      {#if file.ascent != null}
        {@const ascent = file.ascent}
        <Modal
          backdrop
          bind:open={infoOpen}
          panel={false}
          contentClass="w-96"
          title={m.common_details()}
          subtitle={file.uploader?.username}
        >
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              class={[props.class, 'flex flex-col items-start gap-1 text-left']}
              onclick={() => (infoOpen = !infoOpen)}
            >
              <span class="flex items-center gap-2">
                <AscentType status={ascent.type} />
                {#if ascent.dateTime != null}
                  <span class="text-xs opacity-80">{formatDay(ascent.dateTime, now(), getLocale())}</span>
                {/if}
                <Icon name="chevron-down" size={14} class="rotate-180 opacity-60" />
              </span>
              {#if ascentNotes !== ''}
                <span class="text-sm opacity-90">
                  <Markdown className="short" disableLinks encloseReferences="strong" markdown={ascentNotes} />
                </span>
              {/if}
            </button>
          {/snippet}

          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <!-- No gap between type and grade: adjacent .route-tags seam into one pill. -->
              <span class="flex">
                <AscentType status={ascent.type} />
                <RouteGrade
                  band={getGradeBand(ascent.gradeFk)}
                  grade={gradeLabel(global.grades, global.gradingScale, ascent.gradeFk)}
                />
              </span>
              <RouteRating rating={ascent.rating} />
              {#if ascent.dateTime != null}
                <span class="flex-1"></span>
                <span class="text-surface-600-400 text-xs font-semibold">
                  {formatDay(ascent.dateTime, now(), getLocale())}
                </span>
              {/if}
            </div>

            <ConditionsPill
              class="self-start"
              humidity={file.ascent?.humidity}
              temperature={file.ascent?.temperature}
            />

            {#if ascentNotes !== ''}
              <div class="text-sm">
                <!-- Reference/link anchors target auth-gated app routes; strip them for an
                     anonymous viewer (the /f share page) so they don't bounce to /auth. -->
                <Markdown markdown={ascentNotes} disableLinks={!signedIn} />
              </div>
            {/if}

            {#if signedIn}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- ascentHref is pre-resolved above. -->
              <a class="btn preset-outlined-surface-200-800 w-full" href={ascentHref}>
                {m.ascents_viewAscent()}
                <Icon name="chevron-right" size={15} />
              </a>
            {/if}
          </div>
        </Modal>
      {/if}

      {#if host != null}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- external origin URL, not an app route -->
        <a href={file.source} target="_blank" rel="noopener noreferrer" class="self-start text-sm underline opacity-80">
          {m.media_source()}: {host}
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
