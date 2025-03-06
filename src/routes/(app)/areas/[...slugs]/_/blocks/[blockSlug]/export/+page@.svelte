<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
  import by from '$lib/assets/by.svg'
  import cc from '$lib/assets/cc.svg'
  import logo from '$lib/assets/logo.png'
  import nc from '$lib/assets/nc.svg'
  import sa from '$lib/assets/sa.svg'
  import BlockEntry from '$lib/components/AreaBlockListing/components/BlockEntry'
  import { selectedRouteStore } from '$lib/components/TopoViewer'
  import type { NestedArea } from '$lib/db/types'
  import { convertException } from '$lib/errors'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import * as domtoimage from 'modern-screenshot'
  import '../../../../../../../../app.css'

  let { data } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let dom: HTMLElement
  const date = new Date().toISOString().split('T')[0]
  const DEBUG = false

  let loadedTopos = $state(0)
  let shareData: ShareData | null = $state(null)
  let error: string | null = $state(null)

  const onLoadTopo = async () => {
    selectedRouteStore.set(null)

    if (++loadedTopos === data.block.topos.length) {
      const dataUrl = await domtoimage.domToBlob(dom)

      const file = new File([dataUrl], `${data.block.slug}_${date}.png`)

      shareData = {
        title: `${data.block.slug}_${date}`,
        text: `${data.block.slug}_${date}`,
        files: [file],
      }
    }
  }

  const onShare = async () => {
    if (shareData?.files == null) {
      return
    }

    try {
      if (navigator.canShare?.(shareData) && navigator.share != null) {
        await navigator.share(shareData)
      } else {
        throw new Error('Unable to share item')
      }
    } catch (exception) {
      if (exception instanceof Error && exception.name === 'AbortError') {
        return
      }

      error = convertException(exception)
    }
  }

  const onDownload = async () => {
    if (shareData?.files == null) {
      return
    }

    try {
      const link = document.createElement('a')
      link.download = `${data.block.slug}_${date}.png`
      link.href = URL.createObjectURL(shareData.files[0])
      link.click()
    } catch (exception) {
      error = convertException(exception)
    }
  }
</script>

<svelte:head>
  <title>Exporting {data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class={DEBUG ? undefined : 'h-full w-full overflow-hidden'}>
  {#if !DEBUG}
    <div
      class="bg-surface-50-950 absolute top-0 left-0 z-[100] flex h-full w-full flex-col items-center justify-center gap-4"
    >
      {#if error != null}
        <aside class="card preset-tonal-error mt-8 p-2 whitespace-pre-line md:p-4">
          <p>Error: {error}</p>
        </aside>
      {:else if shareData != null}
        Done

        <div class="flex gap-2">
          <button class="btn preset-filled-primary-500" onclick={onDownload}>
            <i class="fa-solid fa-floppy-disk"></i>
            Save to device
          </button>

          {#if navigator.canShare?.(shareData) && navigator.share != null}
            <button class="btn preset-filled-primary-500" onclick={onShare}>
              <i class="fa-solid fa-share"></i>
              Share
            </button>
          {/if}
        </div>
      {:else}
        <div>
          <ProgressRing value={null} />
        </div>

        Preparing export
      {/if}

      <a class="btn preset-outlined-primary-500" href={basePath}>
        <i class="fa-solid fa-angle-left"></i>
        Go back
      </a>
    </div>
  {/if}

  <section bind:this={dom} class="bg-surface-50-950 p-2">
    <div class="mb-4 flex justify-between">
      <img alt={PUBLIC_APPLICATION_NAME} src={logo} class="w-16" />

      <div class="flex items-center">
        <h1 class="w-[150mm] overflow-hidden text-2xl text-ellipsis whitespace-nowrap">
          {(data.block.area as NestedArea).parent?.name} / {data.block.area.name}
        </h1>
      </div>

      <div class="mt-auto text-right">
        <p>Version: {date}</p>

        {#if PUBLIC_TOPO_EMAIL}
          <p>
            Kontakt:
            {PUBLIC_TOPO_EMAIL}
          </p>
        {/if}

        <p class="flex justify-end gap-1">
          Lizenz: CC BY-NC-SA 4.0
          <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={cc} alt="" />
          <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={by} alt="" />
          <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={nc} alt="" />
          <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={sa} alt="" />
        </p>
      </div>
    </div>

    <BlockEntry
      block={data.block}
      index={0}
      itemClass="mt-4"
      {onLoadTopo}
      topoViewerProps={{ limitImgHeight: false }}
    />
  </section>
</div>

<style>
  section {
    width: 297mm;
  }
</style>
