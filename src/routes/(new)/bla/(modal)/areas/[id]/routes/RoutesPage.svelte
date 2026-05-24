<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { getAreaContext } from '$lib/contexts/area'
  import { getI18n } from '$lib/i18n'
  import { sheetState } from '../../../Modal'
  import RouteList from './RouteList'

  const { area } = getAreaContext()
  const { t } = getI18n()

  $effect(() => {
    sheetState.title = titleSnippet
    sheetState.subtitle = subtitleSnippet
  })
</script>

<svelte:head>
  <title>{area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#snippet titleSnippet()}
  <div class="flex items-center">
    {#if navigation.canGoBack}
      <button class="btn-icon" onclick={() => navigation.back()} title={t('common.back')}>
        <i class="fa-solid fa-arrow-left"></i>
      </button>
    {/if}

    {t('nav.routes', { count: 2 })}
  </div>
{/snippet}

{#snippet subtitleSnippet()}
  <div class="flex items-center gap-2">
    <a class="anchor text-xs" href={resolve('/(new)/bla/(modal)/areas/[id]', { id: area.id.toString() })}>
      {area.name}
    </a>
  </div>
{/snippet}

<RouteList areaFk={area.id} />
