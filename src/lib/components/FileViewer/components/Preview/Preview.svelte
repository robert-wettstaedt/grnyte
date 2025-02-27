<script lang="ts">
  import { getVideoThumbnailUrl } from '$lib/bunny'
  import type { File } from '$lib/db/schema'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import type { FileStat } from 'webdav'

  interface Props {
    file: File
    onClick: () => void
    stat: FileStat
  }

  let { file, onClick, stat }: Props = $props()

  const resourcePath = $derived(`/nextcloud${stat.filename}`)

  let mediaIsLoading = $state(stat.mime?.includes('image') ?? false)
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

<div
  class="card card-hover preset-filled-surface-200-800 overflow-hidden cursor-pointer"
  onclick={onClick}
  role="presentation"
>
  <div class="relative">
    {#if mediaHasError}
      <aside class="alert variant-filled-error">
        <div class="alert-message">
          <h3 class="h3">Unable to play video</h3>
          <p>{stat.basename}</p>
        </div>
      </aside>
    {:else}
      {#if mediaIsLoading}
        <div class="absolute w-full h-full flex justify-center items-center bg-black/10">
          <ProgressRing size="size-20 md:size-40" value={null} />
        </div>
      {/if}
      {#if stat.mime?.includes('image')}
        <img alt="" class="h-40 md:h-80 w-full object-cover" src={resourcePath} use:mediaAction />
      {:else if stat.mime?.includes('video')}
        <i
          class="fa-solid fa-circle-play h-40 md:h-80 w-full text-[48px] md:text-[96px] flex justify-center items-center"
        ></i>
      {:else if file.bunnyStreamFk != null}
        <img
          alt=""
          class="h-40 md:h-80 w-full object-cover"
          src={getVideoThumbnailUrl({ videoId: file.bunnyStreamFk })}
          use:mediaAction
        />
      {/if}
    {/if}
  </div>
</div>
