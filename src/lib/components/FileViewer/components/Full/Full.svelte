<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
  import { getVideoIframeUrl } from '$lib/bunny'
  import type { File } from '$lib/db/schema'
  import { Popover, ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import type { MouseEventHandler } from 'svelte/elements'
  import type { FileStat } from 'webdav'
  import type { FileStatusResponse } from '../../../../../routes/api/files/[id]/status/lib'

  interface Props {
    file: File
    onDelete?: () => void
    readOnly?: boolean
    stat: FileStat
    status?: FileStatusResponse

    topLeft?: Snippet
  }

  let { file, readOnly = true, stat, status = $bindable(), topLeft, ...props }: Props = $props()

  let shareData = $derived({
    text: page.data.user?.username
      ? `${page.data.user?.username} wants to share a file with you`
      : 'I want to share a file with you',
    title: PUBLIC_APPLICATION_NAME,
    url: `${page.url.origin}/f/${file.id}`,
  } satisfies ShareData)

  const resourcePath = $derived(`/nextcloud${stat.filename}`)

  const onDelete = async () => {
    await fetch(`/api/files/${file.id}`, { method: 'DELETE' })
    props.onDelete?.()
  }

  const updateVisibility = async (visibility: File['visibility']) => {
    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: 'PUT',
        body: JSON.stringify({ visibility }),
      })
      if (res.ok) {
        file = { ...file, visibility }
      }
    } catch (error) {
      console.error(error)
    }
  }

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

  const onCopyUrl: MouseEventHandler<HTMLElement> = async (event) => {
    const target = event.target as HTMLElement
    const text = target.innerHTML

    await navigator.clipboard.writeText(shareData.url)

    target.innerHTML = 'Copied'
    setTimeout(() => {
      target.innerHTML = text
    }, 2000)
  }
</script>

<div class="relative h-full w-full">
  {#if mediaHasError || status != null}
    <aside class="alert variant-filled-error flex h-full items-center justify-center p-1">
      <div class="alert-message max-w-[200px] text-center">
        <h5 class="h5">{status?.title ?? 'Unable to play video'}</h5>
        <p class="text-sm">{status?.message ?? stat.basename}</p>
      </div>
    </aside>
  {:else}
    {#if mediaIsLoading}
      <div class="absolute flex h-full w-full items-center justify-center bg-black/80">
        <ProgressRing value={null} />
      </div>
    {/if}

    {#if file.bunnyStreamFk != null}
      <iframe
        allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
        allowfullscreen
        class="absolute top-0 left-0 h-full w-full border-none"
        loading="lazy"
        src={getVideoIframeUrl({ libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID, videoId: file.bunnyStreamFk })}
        title=""
      ></iframe>
    {:else if stat.mime?.includes('image')}
      <img alt="" class="h-full w-full object-contain" src={resourcePath} use:mediaAction />
    {:else if stat.mime?.includes('video')}
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
        <source src={resourcePath} type={stat.mime} />
        <track kind="captions" />
      </video>
    {/if}
  {/if}

  <div class="absolute top-4 flex w-full items-center justify-between px-2">
    {#if topLeft}
      {@render topLeft?.()}
    {:else}
      <div></div>
    {/if}

    <div class="flex items-center gap-1">
      <Popover
        arrow
        arrowBackground="!bg-surface-200 dark:!bg-surface-800"
        contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px] shadow-lg"
        zIndex="5000"
        positioning={{ placement: 'bottom' }}
        triggerBase="btn-icon bg-black/20 backdrop-blur-sm"
      >
        {#snippet trigger()}
          <i class={`fa-solid ${file.visibility === 'public' ? 'fa-globe' : 'fa-lock'}`}></i>
        {/snippet}

        {#snippet content()}
          <p class="text-sm">
            {#if file.visibility === 'public'}
              The file is publicly accessible and can be viewed by everyone who has the link.
            {:else}
              The file is private and only accessible by authenticated users.
            {/if}
          </p>

          <footer class="flex justify-between gap-2">
            {#if file.bunnyStreamFk == null}
              <p class="text-error-500">Only videos can be made public and shared.</p>
            {:else}
              {#if navigator.canShare?.(shareData) && navigator.share != null}
                <button class="btn btn-sm preset-tonal-primary" onclick={() => navigator.share(shareData)}>
                  <i class="fa-solid fa-share"></i> Share
                </button>
              {:else}
                <button class="btn btn-sm preset-tonal-primary" onclick={onCopyUrl}>
                  <i class="fa-solid fa-copy"></i> Copy
                </button>
              {/if}

              {#if !readOnly}
                {#if file.visibility === 'public'}
                  <button class="btn btn-sm preset-tonal-primary" onclick={updateVisibility.bind(null, 'private')}>
                    <i class="fa-solid fa-lock"></i> Make private
                  </button>
                {:else}
                  <button class="btn btn-sm preset-tonal-primary" onclick={updateVisibility.bind(null, 'public')}>
                    <i class="fa-solid fa-globe"></i> Make public
                  </button>
                {/if}
              {/if}
            {/if}
          </footer>
        {/snippet}
      </Popover>

      {#if !readOnly}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px] shadow-lg"
          zIndex="5000"
          positioning={{ placement: 'bottom' }}
          triggerBase="btn-icon bg-black/20 backdrop-blur-sm"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-ellipsis-vertical"></i>
          {/snippet}

          {#snippet content()}
            <nav class="list-nav w-48">
              <ul>
                <li
                  class="hover:preset-tonal-primary border-surface-800 flex flex-wrap justify-between rounded border-b-[1px] whitespace-nowrap last:border-none"
                >
                  <Popover
                    arrow
                    arrowBackground="!bg-surface-300 dark:!bg-surface-700"
                    contentBase="card bg-surface-300-700 p-4 space-y-4 max-w-[320px]"
                    positioning={{ placement: 'bottom' }}
                    zIndex="5000"
                    triggerClasses="p-2 md:p-4 w-full text-left"
                    classes="w-full"
                  >
                    {#snippet trigger()}
                      <i class="fa-solid fa-trash me-2 w-5"></i>Delete
                    {/snippet}

                    {#snippet content()}
                      <article>
                        <p>Are you sure you want to delete this file?</p>
                      </article>

                      <footer class="flex justify-end">
                        <button class="btn btn-sm preset-filled-error-500 !text-white" onclick={onDelete}> Yes </button>
                      </footer>
                    {/snippet}
                  </Popover>
                </li>
              </ul>
            </nav>
          {/snippet}
        </Popover>
      {/if}
    </div>
  </div>
</div>
