<script lang="ts">
  import { page } from '$app/state'
  import AreaStats from '$lib/components/AreaStats'
  import GenericList from '$lib/components/GenericList'
  import { pageState } from '$lib/components/Layout'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import ZeroQueryWrapper, { type ZeroQueryWrapperBaseProps } from '$lib/components/ZeroQueryWrapper'
  import { queries } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'

  interface Props extends ZeroQueryWrapperBaseProps {
    parentFk?: number | null
  }
  const { parentFk, ...rest }: Props = $props()
  const { t } = getI18n()
</script>

<ZeroQueryWrapper
  {...rest}
  loadingIndicator={{ type: 'skeleton' }}
  query={queries.listAreas({ parentFk: parentFk ?? null })}
>
  {#snippet children(areas)}
    <GenericList
      items={areas.map((item) => ({
        ...item,
        id: item.id!,
        pathname: `${page.url.pathname}/${item.slug}-${item.id}`,
      }))}
      listClasses="border-b-[1px] border-surface-700 last:border-none py-2"
      wrap={false}
    >
      {#snippet left(item)}
        {item.name}

        {#if parentFk == null}
          {#if pageState.userRegions.length > 1}
            <div class="text-surface-400 text-xs">
              {pageState.userRegions.find((region) => region.regionFk === item.regionFk)?.name ?? ''}
            </div>
          {/if}
        {:else}
          <MarkdownRenderer className="short" encloseReferences="strong" markdown={item.description ?? ''} />
        {/if}
      {/snippet}

      {#snippet right(item)}
        <div class="flex w-27.5 flex-col">
          <AreaStats
            areaId={item.id}
            axes={false}
            opts={{ height: 38 }}
            skeletonHeight="h-[70px]"
            spec={{ width: 100 }}
          >
            {#snippet children(routes)}
              <div class="flex items-center justify-end text-sm opacity-70">
                {t('routes.countLabel', { count: routes.length })}
              </div>
            {/snippet}
          </AreaStats>
        </div>
      {/snippet}
    </GenericList>
  {/snippet}
</ZeroQueryWrapper>
