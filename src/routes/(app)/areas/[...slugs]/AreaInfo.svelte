<script lang="ts">
  import AreaStats from '$lib/components/AreaStats'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { ReferencesLoader } from '$lib/components/References'
  import { getAreaContext } from '$lib/contexts/area'
  import { getI18n } from '$lib/i18n'

  const { area } = getAreaContext()
  const { t } = $derived(getI18n())
</script>

<dl>
  {#if area.description != null && area.description.length > 0}
    <div class="flex p-2">
      <span class="flex-auto">
        <dt>{t('common.description')}</dt>
        <dd>
          <MarkdownRenderer className="mt-4" markdown={area.description} />
        </dd>
      </span>
    </div>
  {/if}

  <ReferencesLoader id={area.id!} type="areas" />

  <div class="flex p-2">
    <span class="flex-auto">
      <dt>{t('grades.title')}</dt>

      <dd class="mt-1">
        <AreaStats
          areaId={area.id!}
          opts={{ height: 300 }}
          skeletonHeight="h-90"
          spec={{ width: 'container' as any }}
        />
      </dd>
    </span>
  </div>
</dl>
