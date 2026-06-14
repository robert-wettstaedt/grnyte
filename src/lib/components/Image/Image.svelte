<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLImgAttributes } from 'svelte/elements'

  interface Props extends Omit<HTMLImgAttributes, 'src' | 'class' | 'alt' | 'onload' | 'onerror'> {
    /** Path of the file as stored on the `files` record (leading slash optional). */
    path: string
    /** Alternative text — also announced when the image fails to load. */
    alt: string
    /**
     * Classes for the wrapper box. Give it a size or aspect ratio so the loading
     * and error states have somewhere to render and to avoid layout shift.
     */
    class?: ClassValue
    /** Classes for the inner `<img>` (e.g. to swap `object-cover` for `object-contain`). */
    imgClass?: ClassValue
    /** Replaces the default broken-image placeholder. */
    error?: Snippet
  }

  let { path, alt, class: className, imgClass, error, ...rest }: Props = $props()

  type Status = 'loading' | 'loaded' | 'error'

  const src = $derived(`/image/${path.replace(/^\/+/, '')}`)
  let status = $state<Status>('loading')
</script>

<div class={['bg-surface-200-800 relative overflow-hidden', className]}>
  <!--
    The image stays mounted in every state: it loads behind the skeleton, and
    when `src` changes it keeps showing the previous image until the new one
    resolves (or errors) — no flash back to the skeleton between images.
  -->
  <img
    loading="lazy"
    decoding="async"
    {...rest}
    {src}
    {alt}
    class={['h-full w-full object-cover transition-opacity duration-200', status !== 'loaded' && 'opacity-0', imgClass]}
    onload={() => (status = 'loaded')}
    onerror={() => (status = 'error')}
  />

  {#if status === 'loading'}
    <div class="placeholder absolute inset-0 animate-pulse" aria-hidden="true"></div>
  {:else if status === 'error'}
    {#if error}
      {@render error()}
    {:else}
      <div class="text-surface-500 absolute inset-0 grid place-items-center" role="img" aria-label={alt}>
        <Icon name="image-off" size={24} />
      </div>
    {/if}
  {/if}
</div>
