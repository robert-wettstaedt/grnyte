<script lang="ts">
  import CorrectedGrade from '$lib/components/RouteGrade/components/CorrectedGrade'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { queries, type Row } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'

  interface Props {
    route: Row<'routes'>
  }

  const { route }: Props = $props()

  const { t } = getI18n()
</script>

{#if route.id != null}
  <ZeroQueryWrapper
    loadingIndicator={{ count: 2, height: 'h-10', type: 'skeleton' }}
    query={queries.listAscents({ grade: null, routeId: route.id })}
  >
    {#snippet children(ascents)}
      {@const map = ascents.reduce((map, ascent) => {
        const count = map.get(ascent.gradeFk!) ?? 0
        map.set(ascent.gradeFk!, count + 1)
        return map
      }, new Map<number, number>())}

      {#if map.size > 0}
        <div class="flex p-2">
          <span class="flex-auto">
            <dt>{t('grade.opinions')}</dt>
            <dd class="mt-1 flex flex-col gap-2">
              {#if route.gradeFk != null}
                <div class="flex w-full items-center">
                  <div class="w-28">
                    <CorrectedGrade oldGrade={route.gradeFk} newGrade={null} />
                  </div>

                  <span class="text-surface-500 text-sm"> {t('grade.originalGrade')} </span>
                </div>
              {/if}

              {#each map.entries() as [grade, count]}
                {#if count != null}
                  <div class="flex w-full items-center">
                    <div class="w-28">
                      <CorrectedGrade oldGrade={grade} newGrade={null} />
                    </div>

                    <span class="text-surface-500 text-sm">
                      {count}x
                    </span>
                  </div>
                {/if}
              {/each}
            </dd>
          </span>
        </div>
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
