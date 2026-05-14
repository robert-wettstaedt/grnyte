<script lang="ts">
  import CorrectedGrade from '$lib/components/RouteGrade/components/CorrectedGrade'
  import RouteRating from '$lib/components/RouteRating'
  import Trans, { part } from '$lib/components/Trans'
  import { getI18n } from '$lib/i18n'
  import { compareAsc, format, formatDistance } from 'date-fns'
  import { de, enGB } from 'date-fns/locale'
  import type { AscentEntity } from '../..'
  import EntityLink from '../../components/EntityLink'
  import type { ItemProps } from '../../components/Item'
  import Username from '../../components/Username'

  type Props = Pick<ItemProps, 'activity' | 'withBreadcrumbs' | 'withDetails'> & {
    entity: AscentEntity
  }

  const { activity, entity, withBreadcrumbs, withDetails }: Props = $props()

  const { t, language } = getI18n()
  const locale = $derived(language === 'de' ? de : enGB)

  const routeNameClasses = $derived.by(() => {
    if (
      activity.entity.type === 'route' &&
      activity.entity.object != null &&
      ('userGradeFk' in activity.entity.object || 'userRating' in activity.entity.object)
    ) {
      return '-inset-y-px'
    }

    return ''
  })
</script>

<span>
  {#if entity.object?.type != null}
    <Trans
      key="activity.ascent.created"
      values={{
        type: t(`activity.ascent.types.${entity.object.type}`),
        user: part(Username, { activity, withDetails }, ''),
        route: part(
          EntityLink,
          {
            className: `relative max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap ${routeNameClasses}`,
            entity: activity.parentEntity,
            entityId: activity.parentEntityId,
            entityName: activity.parentEntityName,
            entityType: activity.parentEntityType,
            withBreadcrumbs: false,
          },
          '',
        ),
      }}
    ></Trans>
  {/if}

  {#if withBreadcrumbs && activity.parentEntity?.breadcrumb != null}
    <span class="text-surface-500">{t('common.in')}</span>

    {#each activity.parentEntity?.breadcrumb as crumb, i}
      <span class="text-surface-500 inline-flex">{crumb}</span>

      {#if i < activity.parentEntity?.breadcrumb.length - 1}
        <span class="text-surface-500 mx-1 text-sm" aria-hidden="true">&gt;</span>
      {/if}
    {/each}
  {/if}

  {#if (entity.object?.gradeFk ?? entity.object?.rating) != null}
    <div class="my-2 flex items-center gap-x-1 md:gap-x-2">
      <span class="opacity-80"> {t('activity.ascent.personalOpinion')}: </span>

      {#if entity.object?.gradeFk != null}
        <CorrectedGrade oldGrade={entity.object?.gradeFk} newGrade={undefined} />
      {/if}

      {#if entity.object?.rating != null}
        <RouteRating value={entity.object.rating} />
      {/if}
    </div>
  {/if}

  {#if (entity.object?.temperature ?? entity.object?.humidity) != null}
    <div class="my-2 flex items-center gap-x-1 md:gap-x-2">
      {#if entity.object?.temperature != null}
        <div class="chip preset-outlined-surface-500">
          <i class="fa-solid fa-temperature-full"></i>
          {entity.object.temperature}°C
        </div>
      {/if}

      {#if entity.object?.humidity != null}
        <div class="chip preset-outlined-surface-500">
          <i class="fa-solid fa-droplet"></i>
          {entity.object.humidity}%
        </div>
      {/if}
    </div>
  {/if}

  {#if entity.object != null && activity.createdAt != null && entity.object.dateTime && compareAsc(format(new Date(activity.createdAt), 'yyyy-MM-dd'), new Date(entity.object.dateTime)) !== 0}
    <span>
      {formatDistance(new Date(entity.object.dateTime), new Date(), { addSuffix: true, locale })}
    </span>
  {/if}
</span>
