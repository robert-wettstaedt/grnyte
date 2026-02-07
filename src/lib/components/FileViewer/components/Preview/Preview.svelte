<script lang="ts">
  import { PUBLIC_BUNNY_STREAM_HOSTNAME } from '$env/static/public'
  import { getVideoThumbnailUrl, VideoStatus } from '$lib/bunny'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import type { File } from '$lib/db/schema'
  import { getI18n } from '$lib/i18n'
  import { getFileStatus } from './preview.remote'

  interface Props {
    file: File
    onClick: () => void
    status?: VideoStatus
  }

  let { file, onClick, status = $bindable() }: Props = $props()
  const { t } = getI18n()

  const statusTitle = $derived(status == null ? null : t(`videoStatus.${status}.title`))
  const statusMessage = $derived(status == null ? null : t(`videoStatus.${status}.message`))

  const resourcePath = $derived(`/nextcloud${file.path}`)

  // svelte-ignore state_referenced_locally
  let mediaIsLoading = $state(file.bunnyStreamFk == null)
  let mediaHasError = $state(false)
  const mediaAction = (el: HTMLElement) => {
    const onError = async () => {
      try {
        status = await getFileStatus(file.id)
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
          <h5 class="h5">
            {statusTitle ?? (file.bunnyStreamFk == null ? t('files.unableToLoadImage') : t('files.unableToPlayVideo'))}
          </h5>
          <p class="text-sm">{statusMessage ?? ''}</p>
        </div>
      </aside>
    {:else}
      {#if mediaIsLoading}
        <LoadingIndicator class="absolute flex h-full w-full items-center justify-center bg-black/10" size={20} />
      {/if}

      {#if file.bunnyStreamFk != null}
        <img
          alt=""
          class="h-40 w-full object-cover md:h-80"
          src={getVideoThumbnailUrl({ hostname: PUBLIC_BUNNY_STREAM_HOSTNAME, videoId: file.bunnyStreamFk })}
          use:mediaAction
        />
      {:else}
        <img alt="" class="h-40 w-full object-cover md:h-80" src={resourcePath} use:mediaAction />
      {/if}
    {/if}
  </div>
</div>
