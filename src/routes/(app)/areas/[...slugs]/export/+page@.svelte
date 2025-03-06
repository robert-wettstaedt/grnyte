<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
  import SaveBouldering from '$lib/assets/Save-Bouldering.jpg'
  import by from '$lib/assets/by.svg'
  import cc from '$lib/assets/cc.svg'
  import Logo from '$lib/assets/logo.png'
  import nc from '$lib/assets/nc.svg'
  import sa from '$lib/assets/sa.svg'
  import AreaBlockListing from '$lib/components/AreaBlockListing'
  import { selectedRouteStore } from '$lib/components/TopoViewer'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import '../../../../../app.css'

  let { data } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  const DEBUG = false
  const ITEM_CLASS = 'break-after-page h-[210mm] w-[297mm]'

  const noTopos = (
    data.area.areas.length === 0
      ? data.area.blocks.flatMap((block) => block.topos)
      : data.area.areas.flatMap((area) => area.blocks.flatMap((block) => block.topos))
  ).length

  const noMaps = data.area.areas.length === 0 ? 2 : data.area.areas.length + 1

  let done = $state(false)
  let loadedTopos = $state(0)
  let loadedMaps = $state(0)

  const onLoad = () => {
    selectedRouteStore.set(null)

    if (loadedTopos === noTopos && loadedMaps === noMaps) {
      if (!DEBUG) {
        window.print()
      }

      done = true
    }
  }

  const onLoadTopo = () => {
    loadedTopos++
    onLoad()
  }

  const onLoadMap = () => {
    loadedMaps++
    onLoad()
  }

  const ALPHABET_START_INDEX = 'a'.charCodeAt(0)
</script>

<svelte:head>
  <title>Exporting {data.area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class={DEBUG ? undefined : 'h-full w-full overflow-hidden'}>
  {#if !DEBUG}
    <div
      class="bg-surface-50-950 absolute top-0 left-0 z-[100] flex h-full w-full flex-col items-center justify-center gap-4"
      id="progress"
    >
      {#if done}
        Done
        <a class="btn preset-filled-primary-500" href={basePath}>Go back</a>
      {:else}
        <div>
          <ProgressRing max={noTopos + noMaps} value={loadedTopos + loadedMaps} />
        </div>

        Preparing export
      {/if}
    </div>
  {/if}

  <section class={ITEM_CLASS}>
    <div class="flex">
      <div class="w-2/4">
        <div class="flex h-full flex-col p-2 pt-8">
          <h1 class="text-center text-4xl">{data.area.name}</h1>
          <h1 class="text-center text-3xl">Bouldering</h1>

          <div class="mt-4 p-2">
            {#if data.area.description != null && data.area.description.length > 0}
              <div class="rendered-markdown mt-4">
                {@html data.area.description}
              </div>
            {/if}
          </div>

          <div class="mt-auto flex justify-between">
            <img class="w-16" src={Logo} alt="" />

            <div class="text-right">
              <p>Version: {new Date().toISOString().split('T')[0]}</p>

              {#if PUBLIC_TOPO_EMAIL}
                <p>
                  Kontakt:
                  <a class="anchor" href={`mailto:${PUBLIC_TOPO_EMAIL}`}>{PUBLIC_TOPO_EMAIL}</a>
                </p>
              {/if}

              <p class="flex justify-end gap-1">
                Lizenz:
                <a
                  class="anchor flex"
                  href="https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1"
                  target="_blank"
                  rel="license noopener noreferrer"
                >
                  CC BY-NC-SA 4.0
                  <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={cc} alt="" />
                  <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={by} alt="" />
                  <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={nc} alt="" />
                  <img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src={sa} alt="" />
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="w-2/4">
        <img alt="Save bouldering" class="h-full w-full" src={SaveBouldering} />
      </div>
    </div>
  </section>

  <section class={ITEM_CLASS}>
    <h2 class="p-2 text-center text-xl">Karte</h2>

    {#await import('$lib/components/BlocksMap') then BlocksMap}
      <BlocksMap.default
        collapsibleAttribution={false}
        blocks={data.area.blocks}
        height="210mm"
        on:rendercomplete={onLoadMap}
        parkingLocations={data.area.parkingLocations}
        selectedArea={data.area}
        showBlocks={false}
        showRelief={false}
        zoom={16}
      />
    {/await}
  </section>

  {#if data.area.areas.length > 0}
    {#each data.area.areas as area}
      <AreaBlockListing
        blocks={area.blocks}
        getBlockKey={(_, index) => String.fromCharCode(ALPHABET_START_INDEX + index)}
        itemClass={ITEM_CLASS}
        name={area.name}
        {onLoadTopo}
        on:rendercomplete={onLoadMap}
      />
    {/each}
  {:else}
    <AreaBlockListing
      blocks={data.area.blocks}
      getBlockKey={(_, index) => String.fromCharCode(ALPHABET_START_INDEX + index)}
      itemClass={ITEM_CLASS}
      name="Blöcke"
      {onLoadTopo}
      on:rendercomplete={onLoadMap}
    />
  {/if}
</div>

<style>
  @page {
    size: A4 landscape;
    margin: 0;
  }

  @media print {
    :global(html, body) {
      overflow: auto !important;
      height: auto !important;
      width: auto !important;
    }

    :global(body) {
      background: none !important;
      color: #000 !important;
    }

    #progress {
      display: none;
    }
  }
</style>
