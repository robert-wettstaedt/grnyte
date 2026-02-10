<script lang="ts">
  import Trans, { part } from '$lib/components/Trans'
  import EntityLink from '../../components/EntityLink'
  import type { ItemProps } from '../../components/Item'
  import Username from '../../components/Username'

  type Props = Pick<ItemProps, 'activity' | 'withDetails'>

  const { activity, withDetails }: Props = $props()
</script>

<Trans
  key="activity.favorite.created"
  values={{
    user: part(Username, { activity, withDetails }, ''),
    entity: part(
      EntityLink,
      {
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
