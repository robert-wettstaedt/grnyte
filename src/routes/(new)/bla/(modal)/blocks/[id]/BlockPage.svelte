<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { sheetState } from '$lib/components/BottomSheetPanel'
  import { getBlockContext } from '$lib/contexts/block'
  import { getBlockName } from '$lib/helper.svelte'
  import { getI18n } from '$lib/i18n'
  import i18next from 'i18next'
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
    sheetState.subtitle = mySubtitleSnippet
  })
</script>

<svelte:head>
  <title>{getBlockName(block)} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#snippet mySubtitleSnippet()}
  <div class="flex items-center gap-2">
    {#each parents as parent, index}
      <a class="anchor text-xs" href="/bla/areas/{parent.id}">{parent.name}</a>

      {#if index < parents.length - 1}
        <span class="text-xs">·</span>
      {/if}
    {/each}
  </div>
{/snippet}

<BlockInfo />
