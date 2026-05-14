<script lang="ts">
  import { pageState } from '$lib/components/Layout'
  import CorrectedGrade from '$lib/components/RouteGrade/components/CorrectedGrade'
  import RouteRating from '$lib/components/RouteRating'
  import Trans, { part } from '$lib/components/Trans'
  import { getI18n } from '$lib/i18n'
  import { diffWords } from 'diff'
  import EntityLink from '../../components/EntityLink'
  import type { ItemProps } from '../../components/Item'
  import UserLink from '../../components/UserLink'
  import Username from '../../components/Username'

  type Props = Pick<ItemProps, 'activity' | 'withBreadcrumbs' | 'withDetails'>

  const { activity, withBreadcrumbs, withDetails }: Props = $props()

  const { t } = getI18n()

  const diff = $derived.by(() => {
    if (activity.oldValue != null || activity.newValue != null) {
      return diffWords(activity.oldValue ?? '', activity.newValue ?? '')
    }

    return []
  })

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

  const ascentKey = $derived.by(() => {
    if (activity.entity.type !== 'ascent') {
      return null
    }

    const base = `activity.ascent.${activity.type}.`

    if (activity.entity.object?.createdBy === pageState.user?.id) {
      return base + 'bySelf'
    }

    if (activity.entity.object?.author != null) {
      return base + 'byOther'
    }

    return base + 'byUnknown'
  })

  const column = $derived.by(() => {
    let column = ''
    const entityKey = `activity.entities.${activity.entityType}`

    if (activity.columnName == null) {
      column = t(`${entityKey}.withArticle`)
    } else {
      const _column = t(`${entityKey}.columns.${activity.columnName}`)
      column = t(`${entityKey}.withColumn`, { column: _column })
    }

    return column
  })
</script>

<span>
  {#if activity.entity.type === 'ascent' && ascentKey != null}
    <Trans
      key={ascentKey}
      values={{
        column,
        user: part(Username, { activity, withDetails }, ''),
        other: part(UserLink, { user: activity.entity.object?.author }, ''),
        entity: part(
          EntityLink,
          {
            className: `relative max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap ${routeNameClasses}`,
            entity: activity.entity,
            entityId: activity.entityId,
            entityName: activity.entityName,
            entityType: activity.entityType,
            withBreadcrumbs: false,
          },
          '',
        ),
      }}
    ></Trans>
  {:else}
    <Trans
      key="activity.generic.{activity.type}"
      values={{
        column,
        user: part(Username, { activity, withDetails }, ''),
        entity: part(
          EntityLink,
          {
            className: `relative max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap ${routeNameClasses}`,
            entity: activity.entity,
            entityId: activity.entityId,
            entityName: activity.entityName,
            entityType: activity.entityType,
            withBreadcrumbs: false,
          },
          '',
        ),
      }}
    ></Trans>
  {/if}

  {#if activity.parentEntityType != null && activity.parentEntityId != null && activity.parentEntityName != null && withDetails}
    <span class="text-surface-500">in</span>

    <EntityLink
      entity={activity.parentEntity}
      entityId={activity.parentEntityId}
      entityName={activity.parentEntityName}
      entityType={activity.parentEntityType}
      {withBreadcrumbs}
    />
  {/if}
</span>

{#if activity.oldValue != null || activity.newValue != null}
  {#if activity.columnName === 'gradeFk'}
    <div class="inline-flex">
      <CorrectedGrade
        oldGrade={activity.oldValue == null ? null : Number(activity.oldValue)}
        newGrade={activity.newValue == null ? null : Number(activity.newValue)}
      />
    </div>
  {:else if ['notes', 'name', 'tags', 'description', 'first ascent'].includes(activity.columnName ?? '')}
    <span>
      {#each diff as change}
        <span class={change.added ? 'text-green-500' : change.removed ? 'text-red-500' : ''}>
          {change.value}
        </span>
      {/each}
    </span>
  {:else}
    {#if activity.oldValue != null}
      {#if activity.columnName === 'rating'}
        <span class="inline-flex">
          <RouteRating value={Number(activity.oldValue)} />
        </span>
      {:else}
        <s class="text-red-500">
          "{activity.oldValue}"
        </s>
      {/if}
    {/if}

    {#if activity.newValue != null}
      <i class="fa-solid fa-arrow-right-long mx-2"></i>

      {#if activity.columnName === 'rating'}
        <span class="inline-flex">
          <RouteRating value={Number(activity.newValue)} />
        </span>
      {:else}
        <span class="text-green-500">
          "{activity.newValue}"
        </span>
      {/if}
    {/if}
  {/if}
{/if}
