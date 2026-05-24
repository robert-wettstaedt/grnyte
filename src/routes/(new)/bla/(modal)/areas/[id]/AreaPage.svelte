<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaList from '$lib/components/AreaList'
  import BlocksList from '$lib/components/BlocksList'
  import { getAreaContext } from '$lib/contexts/area'
  import { getI18n } from '$lib/i18n'
  import i18n from 'i18next'
  import { sheetState } from '../../Modal'
  import AreaInfo from './AreaInfo.svelte'

  const { area } = getAreaContext()
  const { t } = getI18n()

  const parents = $derived.by(() => {
    type Parent = typeof area.parent
    const arr: NonNullable<Parent>[] = []
    let parent: Parent = area.parent

    while (parent != null) {
      arr.unshift(parent)
      parent = parent.parent as Parent
    }

    return arr
  })

  $effect(() => {
    sheetState.title = `${i18n.format(t(`entities.${area.type}`), 'capitalize')} · ${area.name}`
    sheetState.subtitle = subtitleSnippet
  })
</script>

<svelte:head>
  <title>{area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#snippet subtitleSnippet()}
  <div class="flex items-center gap-2">
    {#each parents as parent, index}
      <a class="anchor text-xs" href={resolve('/(new)/bla/(modal)/areas/[id]', { id: parent.id.toString() })}>
        {parent.name}
      </a>

      {#if index < parents.length - 1}
        <span class="text-xs">·</span>
      {/if}
    {/each}
  </div>
{/snippet}

<AreaInfo />

<hr class="hr border-surface-100-900 my-4" />

{#if area.type === 'sector'}
  <BlocksList areaFk={area.id} basePath={resolve('/bla')} regionFk={area.regionFk} sortable={false} />
{:else}
  <AreaList basePath={resolve('/bla')} parentFk={area.id} />
{/if}
