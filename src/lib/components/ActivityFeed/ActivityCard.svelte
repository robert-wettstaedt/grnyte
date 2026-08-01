<!--
  One feed card: whatever `groupActivities` folded into a group, whether that is a single
  edit or a session of four ascents. The headline is one translated sentence with the actor
  and the entity rendered as markup inside it (see i18n/message.ts); everything below it is
  the existing entity-row, media and grade primitives.

  Entity hydration happens outside: `entityId` is polymorphic text and Zero cannot join it,
  so the feed passes an already-resolved map. A key it does not hold is still syncing (the
  card renders a skeleton row); an explicit `null` is gone (a tombstone).
-->
<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import BlockRow from '$lib/components/EntityRow/BlockRow.svelte'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import UserRow from '$lib/components/EntityRow/UserRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MediaThumbnail from '$lib/components/Media/MediaThumbnail.svelte'
  import Message from '$lib/components/Message/Message.svelte'
  import {
    activityEntityKey,
    activityEntityName,
    activityEntityRefs,
    activityParentRef,
    type ActivityEntityMap,
    type ActivityEntityRef,
  } from '$lib/entities/activity/entity'
  import { activityField } from '$lib/entities/activity/fields'
  import type { ActivityGroup } from '$lib/entities/activity/grouping'
  import { activityGroupVerbKey } from '$lib/entities/activity/verbs'
  import AscentTypeBadge from '$lib/entities/ascent/AscentType.svelte'
  import type { AscentType } from '$lib/entities/ascent/dto'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { now } from '$lib/state/now.svelte'
  import ActivityChanges from './ActivityChanges.svelte'

  interface Props {
    /** The signed-in user, so their own cards read "You" and get a solid avatar. */
    currentUserFk?: number
    /** Hydrated entities keyed by `activityEntityKey`. */
    entities?: ActivityEntityMap
    group: ActivityGroup
  }

  const { currentUserFk, entities, group }: Props = $props()

  const global = getGlobalState()

  /** A card never mixes more than a handful of rows; the rest collapse into a count. */
  const MAX_ROWS = 4

  const newest = $derived(group.activities[0])
  const mine = $derived(currentUserFk != null && group.userFk === currentUserFk)
  const refs = $derived(activityEntityRefs(group.activities))

  const entityOf = (ref: ActivityEntityRef | undefined) =>
    ref == null ? undefined : entities?.get(activityEntityKey(ref))

  // The place a burst happened in, when its rows agree on one. Its row is not rendered
  // (the edits below it are), only its name, in the headline and the session sub line.
  const parent = $derived(activityParentRef(group.activities))
  const placeName = $derived(entityOf(parent)?.name)

  const headlineKey = $derived(activityGroupVerbKey(group))
  const headlineName = $derived(
    group.kind === 'single'
      ? activityEntityName(newest, entityOf(refs[0]))
      : (placeName ?? entityOf(refs[0])?.name ?? activityEntityName(newest, undefined)),
  )

  const actors = $derived(new Set(group.activities.map((activity) => activity.userFk)))

  const summary = $derived.by(() => {
    if (group.kind === 'single') {
      return undefined
    }

    const count = group.activities.length
    const parts: string[] = [
      group.kind === 'session' ? m.activity_summaryAscents({ count }) : m.activity_summaryEdits({ count }),
    ]

    // The edits headline already names the place; a session's does not.
    if (group.kind === 'session' && placeName != null) {
      parts.push(placeName)
    }
    if (actors.size > 1) {
      parts.push(m.activity_summaryPeople({ count: actors.size }))
    }

    return parts.join(' · ')
  })

  // A new ascent stores its ascent type in `newValue`; every other row has no status glyph.
  const status = $derived(
    newest.entityType === 'ascent' && newest.type === 'created'
      ? (newest.newValue as AscentType | undefined)
      : undefined,
  )

  const files = $derived(refs.flatMap((ref) => entityOf(ref)?.files ?? []))
  const note = $derived(refs.map((ref) => entityOf(ref)?.note).find((value) => value != null && value.length > 0))

  // Whose ascent the row is about. A region admin may edit anyone's, so "an ascent" would
  // leave the reader guessing; `owner` picks between the own-ascent and the named-climber
  // wording. Unknown counts as somebody else's: claiming it was their own would be a lie,
  // while the unresolved name renders as the same placeholder every other slot uses.
  const climber = $derived(entityOf(refs[0]))
  const owner = $derived(climber?.climberFk != null && climber.climberFk === newest.userFk ? 'self' : 'other')

  const hasChanges = $derived(group.activities.some((activity) => activityField(activity.columnName) != null))
  let expanded = $state(false)
</script>

{#snippet strong(value: string | undefined)}
  {#if value == null || value.length === 0}
    <span class="bg-surface-200-800 inline-block h-3 w-20 animate-pulse rounded align-middle"></span>
  {:else}
    <strong class="font-semibold">{value}</strong>
  {/if}
{/snippet}

<!-- Only the `person=*` variants carry {actor}; the "You …" ones spell the pronoun out. -->
{#snippet actorName()}{@render strong(newest.userName)}{/snippet}

{#snippet climberName()}{@render strong(climber?.climberName)}{/snippet}

{#snippet entityName()}{@render strong(headlineName)}{/snippet}

{#snippet skeletonRow()}
  <div class="flex items-center gap-2.5 px-1 py-2" aria-busy="true">
    <span class="bg-surface-200-800 size-13 flex-none animate-pulse rounded-xl"></span>
    <span class="bg-surface-200-800 h-3.5 w-32 animate-pulse rounded"></span>
  </div>
{/snippet}

{#snippet tombstoneRow(ref: ActivityEntityRef)}
  <div class="text-surface-600-400 flex items-center gap-2.5 px-1 py-2 text-sm italic">
    <span class="bg-surface-200-800/60 grid size-13 flex-none place-items-center rounded-xl">
      <Icon name="trash" size={20} />
    </span>
    <span>{activityEntityName(newest, null) ?? m.activity_entityDeleted()}</span>
    <span class="sr-only">{ref.type}</span>
  </div>
{/snippet}

{#snippet entityRow(ref: ActivityEntityRef)}
  {@const entity = entityOf(ref)}
  {#if entity === undefined}
    {@render skeletonRow()}
  {:else if entity === null}
    {@render tombstoneRow(ref)}
  {:else if entity.row === 'route' && entity.route != null}
    <RouteRow
      crumbs={entity.crumbs}
      grade={gradeLabel(global.grades, global.gradingScale, entity.route.gradeFk)}
      href={entity.href}
      route={entity.route}
      status={entity.ascentType}
      variant="option"
    />
  {:else if entity.row === 'area'}
    <AreaRow
      crumbs={entity.crumbs}
      description={entity.description}
      href={entity.href}
      name={entity.name}
      variant="option"
    />
  {:else if entity.row === 'block'}
    <BlockRow
      crumbs={entity.crumbs}
      href={entity.href}
      name={entity.name}
      topoImagePath={entity.topoImagePath}
      variant="option"
    />
  {:else if entity.row === 'user'}
    <UserRow crumbs={entity.crumbs} href={entity.href} name={entity.name} variant="option" />
  {/if}
{/snippet}

<article class="bg-surface-100-900 border-surface-200-800 space-y-2.5 rounded-2xl border p-3">
  <header class="flex items-start gap-2.5">
    <!-- `solid` already means "a registered user rather than a typed-in name" (see Avatar) and
         every actor here is registered, so it cannot also mark your own row. Your rows say
         "Me" in place of the initials, the same way the first-ascensionist picker does. -->
    {#if mine}
      <Avatar size={34} solid>{m.common_me()}</Avatar>
    {:else}
      <Avatar name={newest.userName} size={34} solid loading={newest.userName.length === 0} />
    {/if}

    <div class="min-w-0 flex-1">
      <p class="text-surface-950-50 text-sm/snug">
        <Message
          key={headlineKey}
          params={{ owner, person: mine ? 'self' : 'other' }}
          parts={{ actor: actorName, climber: climberName, name: entityName }}
        />
      </p>

      {#if summary}
        <p class="text-surface-600-400 mt-0.5 text-xs">{summary}</p>
      {/if}
    </div>

    <div class="flex flex-none items-center gap-1.5">
      {#if status}
        <AscentTypeBadge {status} />
      {/if}
      <time class="text-surface-600-400 text-xs whitespace-nowrap" datetime={new Date(group.createdAt).toISOString()}>
        {formatUploadedAt(group.createdAt, now(), getLocale())}
      </time>
    </div>
  </header>

  {#if files.length > 0}
    <!-- Thumbnails only: the one viewer for the whole list is mounted by ActivityFeed,
         since a lightbox per card would open several at once on the same `?media` param. -->
    <div class="flex snap-x snap-mandatory gap-2 overflow-x-auto">
      {#each files as file (file.id)}
        <MediaThumbnail {file} class="h-40 snap-start" />
      {/each}
    </div>
  {/if}

  {#if refs.length > 0}
    <div class="space-y-1">
      {#each refs.slice(0, MAX_ROWS) as ref (activityEntityKey(ref))}
        {@render entityRow(ref)}
      {/each}

      {#if refs.length > MAX_ROWS}
        <p class="text-surface-600-400 px-1 text-xs">{m.activity_moreEntities({ count: refs.length - MAX_ROWS })}</p>
      {/if}
    </div>
  {/if}

  {#if note}
    <blockquote class="border-surface-300-700 text-surface-600-400 border-s-2 ps-2.5 text-sm">{note}</blockquote>
  {/if}

  {#if hasChanges}
    <button
      type="button"
      class="text-surface-600-400 hover:text-surface-950-50 flex items-center gap-1 text-xs font-semibold"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
      {expanded ? m.activity_hideChanges() : m.activity_showChanges()}
    </button>

    {#if expanded}
      <ActivityChanges activities={group.activities} />
    {/if}
  {/if}
</article>
