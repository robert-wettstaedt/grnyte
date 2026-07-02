<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLImgAttributes } from 'svelte/elements'

  interface Props extends Omit<HTMLImgAttributes, 'src' | 'class' | 'alt' | 'onload' | 'onerror'> {
    /** Path of the file as stored on the `files` record (leading slash optional). */
    path: string
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
    /** Classes for the inner `<img>` (e.g. to swap `object-cover` for `object-contain`). */
    imgClass?: ClassValue
    /** Replaces the default failure placeholder (both error and offline). */
    error?: Snippet
    /** Bound to the loaded image's intrinsic pixel size (0 until it loads). */
    naturalWidth?: number
    /** Bound to the loaded image's intrinsic pixel size (0 until it loads). */
    naturalHeight?: number
    /**
     * Request a resized, cacheable thumbnail this many px wide instead of the
     * full-res image — for list tiles and other small renders. Aspect-preserving.
     */
    previewWidth?: number
  }

  let {
    path,
    alt,
    class: className,
    imgClass,
    error,
    naturalWidth = $bindable(),
    naturalHeight = $bindable(),
    previewWidth,
    ...rest
  }: Props = $props()

  type Status = 'loading' | 'loaded' | 'error' | 'offline'

  const src = $derived(`/image/${path.replace(/^\/+/, '')}${previewWidth == null ? '' : `?w=${previewWidth}`}`)
  let status = $state<Status>('loading')
  const failed = $derived(status === 'error' || status === 'offline')
  // Remount key for the <img>: bumping it re-issues the request after a failure.
  let retry = $state(0)
</script>

<!--
  Back online → retry failed loads; remounting the <img> restarts the request.
  navigator.onLine is trusted only when false (same rule as Form.svelte): false
  positives are common, false negatives are not — so `offline` is certain, and
  everything else stays a generic error.
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
        'h-full w-full object-cover transition-opacity duration-200',
        status !== 'loaded' && 'opacity-0',
        imgClass,
      ]}
      onload={() => (status = 'loaded')}
      onerror={() => (status = navigator.onLine ? 'error' : 'offline')}
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
