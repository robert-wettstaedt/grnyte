<!--
  One hydrated entity as a row, in whichever of its three shapes it is in: still syncing
  (a skeleton), hydration finished without it (a tombstone), or there (the row for its kind).

  Shared by the feed card and the notification inbox. Both hold the same thing - a polymorphic
  `(entityType, entityId)` ref that Zero cannot join, resolved in a second pass - and both have
  to render all three states, so the branch lives here rather than once per screen.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ActivityCardRow } from '$lib/entities/activity/card'
  import type { ActivityEntityType } from '$lib/entities/activity/dto'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { resolveMessage, type MessageKey } from '$lib/i18n/message'
  import { getGlobalState } from '$lib/state/global.svelte'
  import AreaRow from './AreaRow.svelte'
  import BlockRow from './BlockRow.svelte'
  import RouteRow from './RouteRow.svelte'
  import UserRow from './UserRow.svelte'

  interface Props {
    row: ActivityCardRow
    /** Passed through to the row primitives. `option` is the flat, tighter row for nesting
     *  inside another card; `card` is the bordered list item. */
    variant?: 'card' | 'option'
  }

  const { row, variant = 'option' }: Props = $props()

  const global = getGlobalState()

  /** What a tombstone was, since the entity is no longer there to say so itself. */
  const ENTITY_LABEL: Record<ActivityEntityType, MessageKey> = {
    area: 'common_area',
    ascent: 'common_ascent',
    block: 'common_block',
    // Neutral: the row is a tombstone because the file is gone, so nothing is left to say
    // whether it was a photo or a video.
    file: 'common_media',
    route: 'common_route',
    user: 'common_person',
  }
</script>

{#if row.state === 'skeleton'}
  <div class="flex items-center gap-2.5 px-1 py-2" aria-busy="true">
    <span class="bg-surface-200-800 size-13 flex-none animate-pulse rounded-xl"></span>
    <span class="bg-surface-200-800 h-3.5 w-32 animate-pulse rounded"></span>
  </div>
{:else if row.state === 'tombstone'}
  <div class="text-surface-600-400 flex items-center gap-2.5 px-1 py-2 text-sm">
    <span class="bg-surface-200-800/60 grid size-13 flex-none place-items-center rounded-xl">
      <Icon name="trash" size={20} />
    </span>

    <!-- The name line only when a name was actually stored. A tombstone with nothing to name used
         to render the type over `common_unnamed`, which is the label above it said twice.

         Without a name the type stops being an eyebrow and becomes the whole content, so it is set
         as the line rather than as the caption over an empty one. -->
    <span class="min-w-0">
      <span class={row.name == null ? 'block' : 'text-surface-500 block text-[11px] font-semibold'}>
        {resolveMessage(ENTITY_LABEL[row.ref.type])}
      </span>

      {#if row.name != null}
        <span class="block truncate italic">{row.name}</span>
      {/if}
    </span>
  </div>
{:else if row.entity != null}
  {@const entity = row.entity}
  {#if entity.row === 'route' && entity.route != null}
    <RouteRow
      crumbs={entity.crumbs}
      grade={gradeLabel(global.grades, global.gradingScale, entity.route.gradeFk)}
      href={entity.href}
      route={entity.route}
      status={entity.ascentType}
      {variant}
    />
  {:else if entity.row === 'area'}
    <AreaRow crumbs={entity.crumbs} description={entity.description} href={entity.href} name={entity.name} {variant} />
  {:else if entity.row === 'block'}
    <BlockRow
      crumbs={entity.crumbs}
      href={entity.href}
      name={entity.name}
      topoImagePath={entity.topoImagePath}
      {variant}
    />
  {:else if entity.row === 'user'}
    <UserRow crumbs={entity.crumbs} href={entity.href} name={entity.name} {variant} />
  {/if}
{/if}
