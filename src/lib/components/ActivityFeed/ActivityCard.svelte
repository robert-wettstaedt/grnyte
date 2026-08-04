<!--
  One feed card: whatever `groupActivities` folded into a group, whether that is a single
  edit or a session of four ascents.

  What the card *says* is decided by `activityCard()` and arrives as a view; this file is
  the markup for it. The two things that cannot live in a pure function stay here: the
  relative clock, and the grade labels that need `globalState`.
-->
<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import BlockRow from '$lib/components/EntityRow/BlockRow.svelte'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import UserRow from '$lib/components/EntityRow/UserRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import MediaThumbnail from '$lib/components/Media/MediaThumbnail.svelte'
  import Message from '$lib/components/Message/Message.svelte'
  import type { ActivityCardRow, ActivityCardView } from '$lib/entities/activity/card'
  import type { ActivityEntityType } from '$lib/entities/activity/dto'
  import { activityEntityKey } from '$lib/entities/activity/entity'
  import AscentTypeBadge from '$lib/entities/ascent/AscentType.svelte'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { resolveMessage, type MessageKey } from '$lib/i18n/message'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { now } from '$lib/state/now.svelte'
  import { slide } from 'svelte/transition'
  import ActivityChanges from './ActivityChanges.svelte'

  interface Props {
    /** Told when the changes open or close, so the page can sync what only they render. */
    onToggle?: (expanded: boolean) => void
    view: ActivityCardView
  }

  const { onToggle, view }: Props = $props()

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

  const summary = $derived(
    view.summary?.map((part) => (part.key == null ? part.text : resolveMessage(part.key, part.params))).join(' · '),
  )

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
{#snippet actorName()}{@render strong(view.actorName)}{/snippet}

{#snippet climberName()}{@render strong(view.climberName)}{/snippet}

<!-- Nothing is coming for this slot (see `entityUnnamed`), so it says so instead of pulsing.
     Same placeholder the route rows use for a route saved without a name. -->
{#snippet entityName()}
  {#if view.entityUnnamed}
    <span class="text-surface-600-400 italic">{m.common_unnamed()}</span>
  {:else}
    {@render strong(view.entityName)}
  {/if}
{/snippet}

{#snippet skeletonRow()}
  <div class="flex items-center gap-2.5 px-1 py-2" aria-busy="true">
    <span class="bg-surface-200-800 size-13 flex-none animate-pulse rounded-xl"></span>
    <span class="bg-surface-200-800 h-3.5 w-32 animate-pulse rounded"></span>
  </div>
{/snippet}

<!-- What it was is all that is left of it, so the row leads with that rather than hiding the
     type in an `sr-only` span: without it a card of tombstones says nothing at all. -->
{#snippet tombstoneRow(row: ActivityCardRow)}
  <div class="text-surface-600-400 flex items-center gap-2.5 px-1 py-2 text-sm">
    <span class="bg-surface-200-800/60 grid size-13 flex-none place-items-center rounded-xl">
      <Icon name="trash" size={20} />
    </span>

    <span class="min-w-0">
      <span class="text-surface-500 block text-[11px] font-semibold">{resolveMessage(ENTITY_LABEL[row.ref.type])}</span>
      <span class="block truncate italic">{row.name ?? m.activity_entityDeleted()}</span>
    </span>
  </div>
{/snippet}

{#snippet entityRow(row: ActivityCardRow)}
  {#if row.state === 'skeleton'}
    {@render skeletonRow()}
  {:else if row.state === 'tombstone'}
    {@render tombstoneRow(row)}
  {:else if row.entity != null}
    {@const entity = row.entity}
    {#if entity.row === 'route' && entity.route != null}
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
  {/if}
{/snippet}

<article class="bg-surface-100-900 border-surface-200-800 space-y-2.5 rounded-2xl border p-3">
  <!-- A summary makes the middle column as tall as the avatar; without one it is a single
       line, which top-aligned would sit above the avatar's and the clock's centre. -->
  <header class="flex gap-2.5 {summary ? 'items-start' : 'items-center'}">
    <!-- `solid` already means "a registered user rather than a typed-in name" (see Avatar) and
         every actor here is registered, so it cannot also mark your own row. Your rows say
         "Me" in place of the initials, the same way the first-ascensionist picker does. -->
    {#if view.mine}
      <Avatar size={34} solid>{m.common_me()}</Avatar>
    {:else}
      <Avatar name={view.actorName} size={34} solid loading={view.actorName.length === 0} />
    {/if}

    <div class="min-w-0 flex-1">
      <p class="text-surface-950-50 text-sm/snug">
        <Message
          key={view.headline.key}
          params={view.headline.params}
          parts={{ actor: actorName, climber: climberName, name: entityName }}
        />
      </p>

      {#if summary}
        <p class="text-surface-600-400 mt-0.5 text-xs">{summary}</p>
      {/if}
    </div>

    <div class="flex flex-none items-center gap-1.5">
      {#if view.status}
        <AscentTypeBadge status={view.status} />
      {/if}
      <time class="text-surface-600-400 text-xs whitespace-nowrap" datetime={new Date(view.createdAt).toISOString()}>
        {formatUploadedAt(view.createdAt, now(), getLocale())}
      </time>
    </div>
  </header>

  {#if view.files.length > 0}
    <!-- Thumbnails only: the one viewer for the whole list is mounted by ActivityFeed,
         since a lightbox per card would open several at once on the same `?media` param. -->
    <div class="flex snap-x snap-mandatory gap-2 overflow-x-auto">
      {#each view.files as file (file.id)}
        <MediaThumbnail {file} class="h-40 snap-start" />
      {/each}
    </div>
  {/if}

  {#if view.rows.length > 0}
    <div class="space-y-1">
      {#each view.rows as row (activityEntityKey(row.ref))}
        {@render entityRow(row)}
      {/each}

      {#if view.overflowCount > 0}
        <p class="text-surface-600-400 px-1 text-xs">{m.activity_moreEntities({ count: view.overflowCount })}</p>
      {/if}
    </div>
  {/if}

  {#if view.note}
    <blockquote class="border-surface-300-700 text-surface-600-400 border-s-2 ps-2.5 text-sm">
      <Markdown markdown={view.note} />
    </blockquote>
  {/if}

  {#if view.changes.length > 0}
    <button
      type="button"
      class="text-surface-600-400 hover:text-surface-950-50 flex items-center gap-1 text-xs font-semibold"
      aria-expanded={expanded}
      onclick={() => onToggle?.((expanded = !expanded))}
    >
      <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
      {expanded ? m.activity_hideChanges() : m.activity_showChanges()}
    </button>

    {#if expanded}
      <div transition:slide={{ duration: 150 }}>
        <ActivityChanges changes={view.changes} />
      </div>
    {/if}
  {/if}
</article>
