<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { getBlockContext } from '$lib/contexts/block'
  import { getBlockName } from '$lib/helper.svelte'
  import { getI18n } from '$lib/i18n'
  import i18next from 'i18next'
  import { sheetState } from '../../Modal'
  import BlockInfo from './BlockInfo.svelte'

  const { block } = getBlockContext()
  const { t } = getI18n()

  const allParents = $derived.by(() => {
    let parent = block.area

    type Parent = typeof parent
    const arr: NonNullable<Parent>[] = []

    while (parent != null) {
      arr.unshift(parent)
      parent = parent.parent as Parent
    }

    return arr
  })

  const parents = $derived.by(() => {
    const crags = allParents.filter((parent) => parent.type === 'crag')
    const sectors = allParents.filter((parent) => parent.type === 'sector')

    return [...crags, ...sectors]
  })

  $effect(() => {
    sheetState.title = `${i18next.format(t('entities.block'), 'capitalize')} · ${getBlockName(block)}`
    sheetState.subtitle = subtitleSnippet
  })
</script>

<svelte:head>
  <title>{getBlockName(block)} - {PUBLIC_APPLICATION_NAME}</title>
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

<BlockInfo />
