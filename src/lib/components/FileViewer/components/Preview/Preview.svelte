<script lang="ts">
  import { PUBLIC_BUNNY_STREAM_HOSTNAME } from '$env/static/public'
  import { getVideoThumbnailUrl } from '$lib/bunny'
  import { upfetch } from '$lib/config'
  import type { File } from '$lib/db/schema'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import type { FileStat } from 'webdav'
  import { FileStatusResponseSchema, type FileStatusResponse } from '../../../../../routes/api/files/[id]/status/lib'

  interface Props {
    file: File
    onClick: () => void
    stat: FileStat
    status?: FileStatusResponse
  }

  let { file, onClick, stat, status = $bindable() }: Props = $props()

  const resourcePath = $derived(`/nextcloud${stat.filename}`)

  let mediaIsLoading = $state(stat.mime?.includes('image') ?? false)
  let mediaHasError = $state(false)
  const mediaAction = (el: HTMLElement) => {
    const onError = async () => {
      try {
        status = await upfetch(`/api/files/${file.id}/status`, { schema: FileStatusResponseSchema })
      } catch (error) {
        mediaHasError = true
      }
    }
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
  class="card card-hover preset-filled-surface-200-800 cursor-pointer overflow-hidden"
  onclick={onClick}
  role="presentation"
>
  <div class="relative h-full w-full">
    {#if mediaHasError || status != null}
      <aside class="alert variant-filled-error flex h-full items-center justify-center p-1">
        <div class="alert-message text-center">
          <h5 class="h5">{status?.title ?? 'Unable to play video'}</h5>
          <p class="text-sm">{status?.message ?? stat.basename}</p>
        </div>
      </aside>
    {:else}
      {#if mediaIsLoading}
        <div class="absolute flex h-full w-full items-center justify-center bg-black/10">
          <ProgressRing size="size-20 md:size-40" value={null} />
        </div>
      {/if}

      {#if file.bunnyStreamFk != null}
        <img
          alt=""
          class="h-40 w-full object-cover md:h-80"
          src={getVideoThumbnailUrl({ hostname: PUBLIC_BUNNY_STREAM_HOSTNAME, videoId: file.bunnyStreamFk })}
          use:mediaAction
        />
      {:else if stat.mime?.includes('image')}
        <img alt="" class="h-40 w-full object-cover md:h-80" src={resourcePath} use:mediaAction />
      {:else if stat.mime?.includes('video')}
        <i
          class="fa-solid fa-circle-play flex h-40 w-full items-center justify-center text-[48px] md:h-80 md:text-[96px]"
        ></i>
      {/if}
    {/if}
  </div>
</div>
