<script lang="ts">
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
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
        return page.data.z.current.query.areas.where('id', Number(entityId))
      case 'ascent':
        return page.data.z.current.query.ascents.where('id', Number(entityId)).related('author').related('files')
      case 'block':
        return page.data.z.current.query.blocks.where('id', Number(entityId))
      case 'route':
        return page.data.z.current.query.routes.where('id', Number(entityId))
    }
  }

  const getQuery = (entityId: ActivityWithDate['entityId'], entityType: ActivityWithDate['entityType']) => {
    switch (entityType) {
      case 'file':
        return page.data.z.current.query.files.where('id', String(entityId))
      case 'user':
        return page.data.z.current.query.users.where('id', Number(entityId))
      default:
        return getParentQuery(entityId, entityType)
    }
  }

  const query = $derived(getQuery(activity.entityId, activity.entityType)?.limit(1))
  const parentQuery = $derived(getParentQuery(activity.parentEntityId, activity.parentEntityType)?.limit(1))

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

<ZeroQueryWrapper query={page.data.z.current.query.users.where('id', activity.userFk).limit(1)}>
  {#snippet children([user])}
    {/* @ts-ignore */ null}
    <ZeroQueryWrapper loadingIndicator={{ type: 'spinner' }} {query}>
      {#snippet children([object])}
        {#if parentQuery == null}
          {@const dto = toDto(user, object)}
          {@render props.children?.(dto)}
        {:else}
          {/* @ts-ignore */ null}
          <ZeroQueryWrapper loadingIndicator={{ type: 'spinner' }} query={parentQuery}>
            {#snippet children([parentObject], result)}
              {@const dto = toDto(user, object, parentObject)}
              {@render props.children?.(dto)}
            {/snippet}
          </ZeroQueryWrapper>
        {/if}
      {/snippet}
    </ZeroQueryWrapper>
  {/snippet}
</ZeroQueryWrapper>
