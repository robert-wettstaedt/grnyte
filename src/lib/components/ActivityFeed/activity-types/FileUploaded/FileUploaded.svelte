<script lang="ts">
  import Trans, { part } from '$lib/components/Trans'
  import { getI18n } from '$lib/i18n'
  import EntityLink from '../../components/EntityLink'
  import type { ItemProps } from '../../components/Item'
  import Username from '../../components/Username'

  type Props = Pick<ItemProps, 'activity' | 'withBreadcrumbs' | 'withDetails'>

  const { activity, withBreadcrumbs, withDetails }: Props = $props()

  const { t } = $derived(getI18n())
</script>

<Trans
  key="activity.file.uploaded"
  values={{
    column: t(`activity.file.columns.${activity.columnName ?? activity.entityType}`),
    user: part(Username, { activity, withDetails }, ''),
  }}
></Trans>

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
