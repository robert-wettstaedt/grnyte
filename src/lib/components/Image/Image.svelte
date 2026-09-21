<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { DERIVATIVE_SIZES, imageSrc, type DerivativeSize } from '$lib/images/derivatives'
  import { isOnline } from '$lib/state/online.svelte'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLImgAttributes } from 'svelte/elements'
  import type { ImageFailure } from './failure'

  interface Props extends Omit<HTMLImgAttributes, 'alt' | 'class' | 'onerror' | 'onload' | 'src'> {
    /**
     * Alternative text: also announced when the image fails to load. An empty
     * string marks the image decorative; the failure placeholder is then
     * hidden from screen readers too.
     */
    alt: string
    /**
     * Classes for the wrapper box. Give it a size or aspect ratio so the loading
     * and error states have somewhere to render and to avoid layout shift.
     */
    class?: ClassValue
    /** Replaces the default failure placeholder (both error and offline). */
    error?: Snippet
    /** Bound to why the placeholder is showing instead of the photo; undefined while it is not. */
    failure?: ImageFailure
    /** How the photo fills the box (`object-fit`). A prop rather than an `imgClass`
     *  override because two object-* utilities on one element resolve by stylesheet
     *  order, not class order: cover silently won over a passed object-contain. */
    fit?: 'contain' | 'cover'
    /** Classes for the inner `<img>`. */
    imgClass?: ClassValue
    /** Bound to the loaded image's intrinsic pixel size (0 until it loads). */
    naturalHeight?: number
    /** Bound to the loaded image's intrinsic pixel size (0 until it loads). */
    naturalWidth?: number
    /** Path of the file as stored on the `files` record (leading slash optional). */
    path: string
    /**
     * Request a resized, cacheable derivative instead of the full-res image, for list
     * tiles and other small renders. Aspect-preserving. 256 for thumbnails, 1024 for
     * anything filling a viewport; omit only where the untouched original is wanted.
     */
    previewWidth?: DerivativeSize
  }

  let {
    alt,
    class: className,
    error,
    failure = $bindable<ImageFailure | undefined>(),
    fit = 'cover',
    imgClass,
    naturalHeight = $bindable(),
    naturalWidth = $bindable(),
    path,
    previewWidth,
    ...rest
  }: Props = $props()

  type Status = 'loaded' | 'loading' | ImageFailure

  const SMALLEST = DERIVATIVE_SIZES[0]

  // The path whose full-size request failed and is being retried at SMALLEST. Keyed on the path,
  // not a flag, which would follow the reader to the next image as a permanent downgrade.
  let steppedDown = $state<string | undefined>()
  const src = $derived(imageSrc(path, steppedDown === path ? SMALLEST : previewWidth))
  let status = $state<Status>('loading')

  // One writer, so `failure` cannot drift from the status a new branch sets.
  function setStatus(next: Status) {
    status = next
    failure = next === 'loaded' || next === 'loading' ? undefined : next
  }

  // A bound `failure` outlives this component (a `{#key path}` remount hands the next image the
  // previous one's), and nothing else ever writes it before the first load settles.
  setStatus('loading')

  function onError() {
    const online = isOnline()
    // Offline, a list view has often cached the thumbnail of the photo the full size cannot reach,
    // and a soft photograph beats a placeholder. Offline only: an online failure keeps the full size
    // so the `online` retry can still fix it, rather than pinning the session to 256 in silence.
    if (!online && previewWidth != null && previewWidth > SMALLEST && steppedDown !== path) {
      steppedDown = path
      return
    }
    setStatus(online ? 'error' : 'offline')
  }

  // Remount key for the <img>: bumping it re-issues the request after a failure.
  let retry = $state(0)
</script>

<!--
  Back online → retry failed loads; remounting the <img> restarts the request.
  The browser's `online` event is the trigger, so a recovery only `isOnline()` can see (the probe or
  Zero's hold cleared with no browser transition) is not retried until something else remounts.
  `onerror` below uses `isOnline()`, which reads false in that case and labels the image offline.
-->
<svelte:window
  ononline={() => {
    if (failure != null) {
      retry++
      steppedDown = undefined
      setStatus('loading')
    }
  }}
/>

<div class={['bg-surface-200-800 relative overflow-hidden', status === 'loading' && 'animate-pulse', className]}>
  <!--
    The image stays mounted in every state (except an explicit retry remount):
    it loads behind the skeleton, and when `src` changes it keeps showing the
    previous image until the new one resolves (or errors). No flash back to
    the skeleton between images.
  -->
  {#key retry}
    <img
      loading="lazy"
      decoding="async"
      {...rest}
      {src}
      {alt}
      bind:naturalWidth
      bind:naturalHeight
      class={[
        'h-full w-full transition-opacity duration-200',
        fit === 'contain' ? 'object-contain' : 'object-cover',
        status !== 'loaded' && 'opacity-0',
        imgClass,
      ]}
      onload={() => setStatus('loaded')}
      onerror={onError}
    />
  {/key}

  {#if failure != null}
    {#if error}
      {@render error()}
    {:else}
      <div
        aria-hidden={alt ? undefined : true}
        aria-label={alt || undefined}
        class="text-surface-500 absolute inset-0 grid place-items-center"
        role={alt ? 'img' : undefined}
      >
        <Icon name={failure === 'offline' ? 'no-signal' : 'image-off'} size="50%" />
      </div>
    {/if}
  {/if}
</div>
