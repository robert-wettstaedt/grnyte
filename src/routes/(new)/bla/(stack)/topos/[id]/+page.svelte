<script lang="ts">
  import { resolve } from '$app/paths'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import StackAppBar from '$lib/components/AppBar/StackAppBar.svelte'
  import TopoImage, { type Dimensions } from '$lib/components/TopoViewer/TopoImage.svelte'
  import { getTopoContext } from '$lib/contexts/topo'
  import { getBlockName } from '$lib/helper.svelte'
  import { getI18n } from '$lib/i18n'
  import { enrichTopo } from '$lib/topo'
  import Modal from './Modal'
  import TopoRouteList from './TopoRouteList'

  const { topo } = getTopoContext()
  const { t } = getI18n()

  const topoDto = $derived(enrichTopo(topo))

  $inspect(topoDto)

  const topoIndex = $derived(topo.block?.topos.findIndex((t) => t.id === topo.id) ?? -1)
  const toposLength = $derived(topo.block?.topos.length ?? 1)
  const indexTitle = $derived(topoIndex >= 0 ? `${t('topo.title')} [${topoIndex + 1}/${toposLength}]` : null)
  const prevTopo = $derived(topoIndex >= 0 ? topo.block?.topos[topoIndex - 1] : undefined)
  const nextTopo = $derived(topoIndex >= 0 ? topo.block?.topos[topoIndex + 1] : undefined)
</script>

<StackAppBar
  backRoute={topo.block == null
    ? undefined
    : resolve('/(new)/bla/(modal)/blocks/[id]', { id: topo.block.id.toString() })}
  subtitle={topo.block?.area == null ? undefined : `${t('common.in')} ${topo.block.area.name}`}
  title={getBlockName(topo.block)}
/>

{#if topoDto == null}
  <!-- TODO -->
  <p>Topo not found</p>
{:else}
  <Modal>
    {#snippet base()}
      <div class="grow" use:fitHeightAction={{ paddingBottom: 0 }}>
        <TopoImage value={topoDto} zoomable />
      </div>
    {/snippet}

    {#snippet title()}
      <div class="flex w-full items-center justify-between">
        {#if topoIndex >= 0 && toposLength > 1}
          <a
            aria-label={t('topo.previousTopo')}
            class={['btn-icon preset-filled-surface-500', prevTopo == null && 'opacity-50']}
            href={prevTopo == null
              ? undefined
              : resolve('/(new)/bla/(stack)/topos/[id]', { id: prevTopo.id.toString() })}
          >
            <i class="fa-solid fa-chevron-left"></i>
          </a>
        {:else}
          <div></div>
        {/if}

        {indexTitle ?? getBlockName(topo.block)}

        {#if topoIndex >= 0 && toposLength > 1}
          <a
            aria-label={t('topo.nextTopo')}
            class={['btn-icon preset-filled-surface-500', nextTopo == null && 'opacity-50']}
            href={nextTopo == null
              ? undefined
              : resolve('/(new)/bla/(stack)/topos/[id]', { id: nextTopo.id.toString() })}
          >
            <i class="fa-solid fa-chevron-right"></i>
          </a>
        {:else}
          <div></div>
        {/if}
      </div>
    {/snippet}

    <TopoRouteList
      routes={topo.routes.filter((item) => item.route != null).map((item) => ({ ...item.route!, block: topo.block }))}
    />
  </Modal>
{/if}
