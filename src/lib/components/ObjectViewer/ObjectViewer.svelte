<script lang="ts">
  import type { ObjectDTO } from '$lib/storage.server'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    children?: import('svelte').Snippet
    object: ObjectDTO
    onDelete?: () => void
    readOnly?: boolean
  }

  let { children, object, onDelete, readOnly = true }: Props = $props()

  let isFullscreen = $state(false)

  const onClickDelete = async () => {
    await fetch(`/api/files/${object.id}`, { method: 'DELETE' })
    isFullscreen = false
    onDelete?.()
  }

  let mediaIsLoading = $state(object.stat?.mimetype?.includes('image') ?? false)
  let mediaHasError = $state(false)
  const mediaAction = (el: HTMLElement) => {
    const onError = () => (mediaHasError = true)
    const onLoad = () => (mediaIsLoading = false)
    const onLoadStart = () => (mediaIsLoading = true)

    const errorEl = el.tagName === 'VIDEO' ? el.querySelector('source') : el

    errorEl?.addEventListener('error', onError)
    el.addEventListener('load', onLoad)
    el.addEventListener('loadeddata', onLoad)
    el.addEventListener('loadstart', onLoadStart)

    return {
      destroy: () => {
        errorEl?.removeEventListener('error', onError)
        el.removeEventListener('load', onLoad)
        el.removeEventListener('loadeddata', onLoad)
        el.removeEventListener('loadstart', onLoadStart)
      },
    }
  }
</script>

<svelte:window onkeyup={(event) => event.key === 'Escape' && (isFullscreen = false)} />

<div
  class="card card-hover preset-filled-surface-200-800 overflow-hidden cursor-pointer"
  onclick={() => (isFullscreen = true)}
  role="presentation"
>
  <div class="relative">
    {#if mediaHasError}
      <aside class="alert variant-filled-error">
        <div class="alert-message">
          <h3 class="h3">Unable to play video</h3>
          <p>{object.storageObject.name}</p>
        </div>
      </aside>
    {:else}
      {#if mediaIsLoading}
        <div class="absolute w-full h-full flex justify-center items-center bg-black/10">
          <ProgressRing size="size-20 md:size-40" value={null} />
        </div>
      {/if}
      {#if object.stat?.mimetype.includes('image')}
        <img
          alt=""
          class="h-40 md:h-80 w-full object-cover"
          src="/storage?resource={object.stat.url}"
          use:mediaAction
        />
      {:else if object.stat?.mimetype.includes('video')}
        {#if object.thumbnail != null}
          <img
            alt=""
            class="absolute top-0 left-0 h-40 md:h-80 w-full object-cover opacity-75"
            src="/storage?resource={object.thumbnail.url}"
          />
        {/if}

        <i
          class="fa-solid fa-circle-play relative h-40 md:h-80 w-full text-[48px] md:text-[96px] flex justify-center items-center"
        ></i>
      {/if}
    {/if}
  </div>

  {#if children}
    <div class="card-footer p-3">
      {@render children?.()}
    </div>
  {/if}
</div>

{#if isFullscreen}
  <div class="fixed top-0 left-0 right-0 bottom-0 z-[5000] p-4 md:p-16 bg-black/90">
    {#if mediaHasError}
      <aside class="alert variant-filled-error">
        <div class="alert-message">
          <h3 class="h3">Unable to play video</h3>
          <p>{object.storageObject.name}</p>
        </div>
      </aside>
    {:else}
      {#if mediaIsLoading}
        <div class="absolute w-full h-full flex justify-center items-center bg-black/80">
          <ProgressRing value={null} />
        </div>
      {/if}
      {#if object.stat?.mimetype.includes('image')}
        <img alt="" class="h-full w-full object-contain" src="/storage?resource={object.stat.url}" use:mediaAction />
      {:else if object.stat?.mimetype.includes('video')}
        <video
          autoplay
          controls
          class="h-full w-full"
          disablepictureinpicture
          disableremoteplayback
          loop
          playsinline
          preload="metadata"
          use:mediaAction
        >
          <source src="/storage?resource={object.stat.url}" type={object.stat.mimetype} />
          <track kind="captions" />
        </video>
      {/if}
    {/if}

    {#if !readOnly}
      <button
        aria-label="Delete"
        class="btn btn-icon preset-filled-error-500 fixed top-8 right-20 !text-white"
        onclick={onClickDelete}
        title="Delete"
      >
        <i class="fa-solid fa-trash"></i>
      </button>
    {/if}

    <button
      aria-label="Close"
      class="btn btn-icon preset-filled-primary-500 fixed top-8 right-8"
      onclick={() => (isFullscreen = false)}
      title="Close"
    >
      <i class="fa-solid fa-x"></i>
    </button>
  </div>
{/if}
