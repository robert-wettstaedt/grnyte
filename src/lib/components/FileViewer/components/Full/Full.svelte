<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
  import { getVideoIframeUrl, VideoStatus } from '$lib/bunny'
  import { pageState } from '$lib/components/Layout'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import type { File } from '$lib/db/schema'
  import { getI18n } from '$lib/i18n'
  import { Menu, Popover, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import type { MouseEventHandler } from 'svelte/elements'

  interface Props {
    file: File
    onDelete?: () => void
    readOnly?: boolean
    status?: VideoStatus

    topLeft?: Snippet
  }

  let { file, readOnly = true, status = $bindable(), topLeft, ...props }: Props = $props()
  const { t } = getI18n()

  const statusTitle = $derived(status == null ? null : t(`videoStatus.${status}.title`))
  const statusMessage = $derived(status == null ? null : t(`videoStatus.${status}.message`))

  let shareData = $derived({
    text: pageState.user?.username ? `${pageState.user?.username} ${t('share.wantsToShare')}` : t('share.iWantToShare'),
    title: PUBLIC_APPLICATION_NAME,
    url: `${page.url.origin}/f/${file.id}`,
  } satisfies ShareData)

  const resourcePath = $derived(`/nextcloud${file.path}`)

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

  // svelte-ignore state_referenced_locally
  let mediaIsLoading = $state(file.bunnyStreamFk == null)
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

    target.innerHTML = t('common.copied')
    setTimeout(() => {
      target.innerHTML = text
    }, 2000)
  }
</script>

<div class="relative h-full w-full">
  {#if mediaHasError || status != null}
    <aside class="alert variant-filled-error flex h-full items-center justify-center p-1">
      <div class="alert-message max-w-50 text-center">
        <h5 class="h5">{status != null ? statusTitle : t('files.unableToPlayVideo')}</h5>
        <p class="text-sm">{status != null ? statusMessage : ''}</p>
      </div>
    </aside>
  {:else}
    {#if mediaIsLoading}
      <LoadingIndicator class="absolute flex h-full w-full items-center justify-center bg-black/80" size={20} />
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
    {:else}
      <img alt="" class="h-full w-full object-contain" src={resourcePath} use:mediaAction />
    {/if}
  {/if}

  <div class="absolute top-4 flex w-full items-center justify-between px-2">
    {#if topLeft}
      {@render topLeft?.()}
    {:else}
      <div></div>
    {/if}

    <div class="flex items-center gap-1">
      <Menu>
        <Menu.Trigger class="btn-icon bg-black/20 backdrop-blur-sm">
          <i class={`fa-solid ${file.visibility === 'public' ? 'fa-globe' : 'fa-lock'}`}></i>
        </Menu.Trigger>

        <Portal>
          <Menu.Positioner class="z-5000!">
            <Menu.Content class="max-w-[320px]">
              <p class="p-2 text-sm">
                {#if file.visibility === 'public'}
                  {t('files.visibility.publicDescription')}
                {:else}
                  {t('files.visibility.privateDescription')}
                {/if}
              </p>

              {#if file.bunnyStreamFk == null}
                <p class="text-error-500 p-2">{t('files.onlyVideosPublic')}</p>
              {:else}
                {#if navigator.canShare?.(shareData) && navigator.share != null}
                  <Menu.Item closeOnSelect={false} value="Share">
                    <button class="flex w-full items-center" onclick={() => navigator.share(shareData)}>
                      <i class="fa-solid fa-share me-2 w-5"></i>
                      {t('share.share')}
                    </button>
                  </Menu.Item>
                {:else}
                  <Menu.Item closeOnSelect={false} value="Copy">
                    <button class="flex w-full items-center" onclick={onCopyUrl}>
                      <i class="fa-solid fa-copy me-2 w-5"></i>
                      {t('common.copy')}
                    </button>
                  </Menu.Item>
                {/if}

                {#if !readOnly}
                  {#if file.visibility === 'public'}
                    <Menu.Item closeOnSelect={false} value="Make private">
                      <button class="flex w-full items-center" onclick={updateVisibility.bind(null, 'private')}>
                        <i class="fa-solid fa-lock me-2 w-5"></i>
                        {t('files.makePrivate')}
                      </button>
                    </Menu.Item>
                  {:else}
                    <Menu.Item closeOnSelect={false} value="Make public">
                      <button class="flex w-full items-center" onclick={updateVisibility.bind(null, 'public')}>
                        <i class="fa-solid fa-globe me-2 w-5"></i>
                        {t('files.makePublic')}
                      </button>
                    </Menu.Item>
                  {/if}
                {/if}
              {/if}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu>

      {#if !readOnly}
        <Menu>
          <Menu.Trigger class="btn-icon bg-black/20 backdrop-blur-sm">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </Menu.Trigger>

          <Portal>
            <Menu.Positioner class="z-5000!">
              <Menu.Content>
                <Menu.Item closeOnSelect={false} value="topo-remove">
                  <Popover positioning={{ placement: 'bottom' }}>
                    <Popover.Trigger class="flex w-full items-center">
                      <i class="fa-solid fa-trash me-2 w-5"></i>
                      {t('common.delete')}
                    </Popover.Trigger>

                    <Portal>
                      <Popover.Positioner class="z-5000!">
                        <Popover.Content class="card bg-surface-200-800 w-full max-w-[320px] space-y-4 p-4">
                          <Popover.Description>
                            <article>
                              <p>{t('files.confirmDelete')}</p>
                            </article>

                            <footer class="flex justify-end">
                              <button class="btn btn-sm preset-filled-error-500 text-white!" onclick={onDelete}>
                                {t('common.yes')}
                              </button>
                            </footer>
                          </Popover.Description>

                          <Popover.Arrow
                            class="[--arrow-background:var(--color-surface-200-800)] [--arrow-size:--spacing(2)]"
                          >
                            <Popover.ArrowTip />
                          </Popover.Arrow>
                        </Popover.Content>
                      </Popover.Positioner>
                    </Portal>
                  </Popover>
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu>
      {/if}
    </div>
  </div>
</div>
