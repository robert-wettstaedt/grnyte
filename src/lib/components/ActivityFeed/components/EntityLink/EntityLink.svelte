<script lang="ts">
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { ActivityDTO } from '../..'
  import type { ItemProps } from '../Item/Item.svelte'

  interface Props {
    className?: string
    entity: ActivityDTO['entity'] | null | undefined
    entityId: ActivityDTO['entityId'] | null | undefined
    entityName: ActivityDTO['entityName'] | null | undefined
    entityType: ActivityDTO['entityType'] | null | undefined
    withBreadcrumbs: ItemProps['withBreadcrumbs']
  }

  const { className, entity, entityId, entityName, entityType, withBreadcrumbs }: Props = $props()
</script>

{#if entityName != null}
  <a class="anchor inline-flex flex-wrap {className}" href={`/${entityType}s/${entityId}`}>
    {#if withBreadcrumbs && entity?.breadcrumb != null}
      {#each entity?.breadcrumb as crumb, i}
        <span class="text-surface-500 inline-flex">{crumb}</span>

        <span class="text-surface-500 mx-1 text-sm" aria-hidden="true">&gt;</span>
      {/each}
    {/if}

    {#if entity?.type === 'route' && entity.object != null}
      {#if withBreadcrumbs && entity?.breadcrumb != null}
        &nbsp;
      {/if}

      {@const route = entity.object}
      <RouteName {route} />
    {:else}
      {entityName}
    {/if}
  </a>
{/if}
