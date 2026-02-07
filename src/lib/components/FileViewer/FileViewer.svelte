<script lang="ts">
  import { pushState } from '$app/navigation'
  import { page } from '$app/state'
  import type { VideoStatus } from '$lib/bunny'
  import type { File } from '$lib/db/schema'
  import { getI18n } from '$lib/i18n'
  import type { FileStat } from 'webdav'
  import Full from './components/Full'
  import Preview from './components/Preview'

  interface Props {
    file: File
    onDelete?: () => void
    readOnly?: boolean

    /**
     * @deprecated
     */
    stat?: FileStat
  }

  let { file, readOnly = true, ...props }: Props = $props()

  let status = $state<VideoStatus | undefined>(undefined)
  let isFullscreen = $state(false)
  const { t } = getI18n()

  const onDelete = () => {
    isFullscreen = false
    props.onDelete?.()
  }

  const onOpenFullscreen = () => {
    const url = new URL(page.url)
    url.searchParams.set('fullscreen', 'true')

    pushState(url, {})
    isFullscreen = true
  }

  const onCloseFullscreen = () => {
    history.back()
    isFullscreen = false
  }

  const onPopstate = () => {
    const url = new URL(page.url)
    isFullscreen = url.searchParams.get('fullscreen') === 'true'
    if (isFullscreen) {
      onCloseFullscreen()
    }
  }
</script>

<svelte:window onkeyup={(event) => event.key === 'Escape' && onCloseFullscreen()} onpopstate={onPopstate} />

<Preview {file} bind:status onClick={onOpenFullscreen} />

{#if isFullscreen}
  <div class="fixed top-0 right-0 bottom-0 left-0 z-5000 bg-black/90 backdrop-blur">
    <Full {file} {onDelete} {readOnly} bind:status>
      {#snippet topLeft()}
        <button
          aria-label={t('common.close')}
          class="btn-icon bg-black/20 text-xl backdrop-blur-sm"
          onclick={onCloseFullscreen}
        >
          <i class="fa-solid fa-arrow-left"></i>
        </button>
      {/snippet}
    </Full>
  </div>
{/if}
