<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { imageSrc, type DerivativeSize } from '$lib/images/derivatives'
  import { isOnline } from '$lib/state/online.svelte'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLImgAttributes } from 'svelte/elements'

  interface Props extends Omit<HTMLImgAttributes, 'alt' | 'class' | 'onerror' | 'onload' | 'src'> {
    /**
     * Alternative text — also announced when the image fails to load. An empty
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
    /** How the photo fills the box (`object-fit`). A prop rather than an `imgClass`
     *  override because two object-* utilities on one element resolve by stylesheet
     *  order, not class order — cover silently won over a passed object-contain. */
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
     * Request a resized, cacheable derivative instead of the full-res image — for list
     * tiles and other small renders. Aspect-preserving. 256 for thumbnails, 1024 for
     * anything filling a viewport; omit only where the untouched original is wanted.
     */
    previewWidth?: DerivativeSize
  }

  let {
    alt,
    class: className,
    error,
    fit = 'cover',
    imgClass,
    naturalHeight = $bindable(),
    naturalWidth = $bindable(),
    path,
    previewWidth,
    ...rest
  }: Props = $props()

  type Status = 'error' | 'loaded' | 'loading' | 'offline'

  const src = $derived(imageSrc(path, previewWidth))
  let status = $state<Status>('loading')
  const failed = $derived(status === 'error' || status === 'offline')
  // Remount key for the <img>: bumping it re-issues the request after a failure.
  let retry = $state(0)
</script>

<!--
  Back online → retry failed loads; remounting the <img> restarts the request.
  `isOnline()` rather than `navigator.onLine` (see $lib/state/online.svelte): the raw flag reads
  true on a fresh document load with the network already dead, which would label every offline
  image a generic error instead of an offline one.
-->
<svelte:window
  ononline={() => {
    if (failed) {
      retry++
      status = 'loading'
    }
  }}
/>

<div class={['bg-surface-200-800 relative overflow-hidden', status === 'loading' && 'animate-pulse', className]}>
  <!--
    The image stays mounted in every state (except an explicit retry remount):
    it loads behind the skeleton, and when `src` changes it keeps showing the
    previous image until the new one resolves (or errors) — no flash back to
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
      onload={() => (status = 'loaded')}
      onerror={() => (status = isOnline() ? 'error' : 'offline')}
    />
  {/key}

  {#if failed}
    {#if error}
      {@render error()}
    {:else}
      <div
        aria-hidden={alt ? undefined : true}
        aria-label={alt || undefined}
        class="text-surface-500 absolute inset-0 grid place-items-center"
        role={alt ? 'img' : undefined}
      >
        <Icon name={status === 'offline' ? 'no-signal' : 'image-off'} size="50%" />
      </div>
    {/if}
  {/if}
</div>
