<script lang="ts">
  import { pushState } from '$app/navigation'
  import { page } from '$app/stores'
  import type { File } from '$lib/db/schema'
  import type { FileStat } from 'webdav'
  import { type FileStatusResponse } from '../../../routes/api/files/[id]/status/lib'
  import Full from './components/Full'
  import Preview from './components/Preview'

  interface Props {
    file: File
    onDelete?: () => void
    readOnly?: boolean
    stat: FileStat
  }

  let { file, readOnly = true, stat, ...props }: Props = $props()

  let status = $state<FileStatusResponse | undefined>(undefined)
  let isFullscreen = $state(false)

  const onDelete = () => {
    isFullscreen = false
    props.onDelete?.()
  }

  const onOpenFullscreen = () => {
    const url = new URL($page.url)
    url.searchParams.set('fullscreen', 'true')

    pushState(url, {})
    isFullscreen = true
  }

  const onCloseFullscreen = () => {
    history.back()
    isFullscreen = false
  }

  const onPopstate = () => {
    const url = new URL($page.url)
    isFullscreen = url.searchParams.get('fullscreen') === 'true'
    if (isFullscreen) {
      onCloseFullscreen()
    }
  }
</script>

<svelte:window onkeyup={(event) => event.key === 'Escape' && onCloseFullscreen()} onpopstate={onPopstate} />

<Preview {file} {stat} bind:status onClick={onOpenFullscreen} />

{#if isFullscreen}
  <div class="fixed top-0 left-0 right-0 bottom-0 z-[5000] bg-black/90 backdrop-blur">
    <Full {file} {onDelete} {readOnly} {stat} bind:status>
      {#snippet topLeft()}
        <button aria-label="Close" class="btn-icon text-xl bg-black/20 backdrop-blur-sm" onclick={onCloseFullscreen}>
          <i class="fa-solid fa-arrow-left"></i>
        </button>
      {/snippet}
    </Full>
  </div>
{/if}
