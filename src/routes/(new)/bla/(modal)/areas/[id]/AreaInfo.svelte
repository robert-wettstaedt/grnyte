<script lang="ts">
  import { resolve } from '$app/paths'
  import AreaStats from '$lib/components/AreaStats'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { ReferencesLoader } from '$lib/components/References'
  import { getAreaContext } from '$lib/contexts/area'
  import { getI18n } from '$lib/i18n'
  import AreaActions from './AreaActions.svelte'

  const { area } = getAreaContext()
  const { t } = getI18n()

  let windowHeight = $state(window.innerHeight)
</script>

<svelte:window bind:innerHeight={windowHeight} />

<AreaActions />

<dl>
  {#if area.description != null && area.description.length > 0}
    <MarkdownRenderer className="mt-4" markdown={area.description} />
  {/if}

  <ReferencesLoader id={area.id!} type="areas" />

  <div class="mt-4 flex">
    <span class="flex-auto">
      <dt class="flex justify-between">
        {t('grades.title')}

        <a class="anchor" href={resolve('/(new)/bla/(modal)/areas/[id]/routes', { id: area.id.toString() })}>
          {t('routes.allRoutes')}

          <i class="fa-solid fa-arrow-right"></i>
        </a>
      </dt>

      <dd class="mt-1">
        <AreaStats
          areaId={area.id!}
          opts={{ height: Math.ceil(windowHeight / 6) }}
          skeletonHeight="h-90"
          spec={{ width: 'container' as any }}
        />
      </dd>
    </span>
  </div>
</dl>
