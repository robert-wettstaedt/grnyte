<script lang="ts">
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { queries } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import type { ActivityDTO, ActivityWithDate, Entity } from '../..'

  interface Props {
    activity: ActivityWithDate
    children?: Snippet<[ActivityDTO]>
  }

  const { activity, ...props }: Props = $props()

  const getParentQuery = (
    entityId: ActivityWithDate['parentEntityId'],
    entityType: ActivityWithDate['parentEntityType'],
  ) => {
    if (entityId == null || entityType == null) {
      return null
    }

    switch (entityType) {
      case 'area':
        return queries.listAreas({ areaId: Number(entityId) })
      case 'ascent':
        return queries.listAscents({ ascentId: Number(entityId) })
      case 'block':
        return queries.listBlocks({ blockId: Number(entityId) })
      case 'route':
        return queries.listRoutes({ routeId: Number(entityId) })
    }
  }

  const getQuery = (entityId: ActivityWithDate['entityId'], entityType: ActivityWithDate['entityType']) => {
    switch (entityType) {
      case 'file':
        return queries.listFiles({ fileId: String(entityId) })
      case 'user':
        return queries.listUsers({ id: Number(entityId) })
      default:
        return getParentQuery(entityId, entityType)
    }
  }

  const query = $derived(getQuery(activity.entityId, activity.entityType))
  const parentQuery = $derived(getParentQuery(activity.parentEntityId, activity.parentEntityType))

  function toDto(user: ActivityDTO['user'], object: Entity['object'], parentObject?: Entity['object']): ActivityDTO {
    const entityName = object != null && 'name' in object ? object.name : null
    const parentEntityName = parentObject != null && 'name' in parentObject ? parentObject.name : null

    return {
      ...activity,
      entity: { type: activity.entityType, object } as Entity,
      entityName,
      parentEntity:
        activity.parentEntityType == null || parentObject == null
          ? undefined
          : ({ type: activity.parentEntityType, object: parentObject } as Entity),
      parentEntityName,
      region: undefined,
      user,
    }
  }
</script>

{/* @ts-ignore */ null}
<ZeroQueryWrapper loadingIndicator={{ type: 'spinner' }} {query}>
  {#snippet children([object])}
    {#if parentQuery == null}
      {@const dto = toDto(activity.user, object)}
      {@render props.children?.(dto)}
    {:else}
      {/* @ts-ignore */ null}
      <ZeroQueryWrapper loadingIndicator={{ type: 'spinner' }} query={parentQuery}>
        {#snippet children([parentObject])}
          {@const dto = toDto(activity.user, object, parentObject)}
          {@render props.children?.(dto)}
        {/snippet}
      </ZeroQueryWrapper>
    {/if}
  {/snippet}
</ZeroQueryWrapper>
