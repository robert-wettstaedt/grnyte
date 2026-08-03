<!--
  The expanded half of an activity card: one line per changed column, rendered by the
  renderer its catalogue entry assigns it rather than by a per-column component. An entry
  that declares no `field` carries no old/new pair, so it simply does not appear.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ActivityChange } from '$lib/entities/activity/card'
  import type { ActivityListItem } from '$lib/entities/activity/dto'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import { resolveMessage } from '$lib/i18n/message'
  import { parseCoords, type StoredCoords } from '$lib/map/coords'
  import { formatDistance } from '$lib/map/map'
  import StaticMap, { type StaticMapPoint } from '$lib/map/StaticMap.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    /** The card's changed columns, already paired with their registry entry by `activityCard`. */
    changes: readonly ActivityChange[]
  }

  const { changes }: Props = $props()

  const global = getGlobalState()

  /** `tags` and `firstAscensionists` are stored comma-joined on the activity row. */
  const list = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

  const grade = (value: string | undefined) => {
    const gradeFk = value == null || value.length === 0 ? undefined : Number(value)
    return Number.isFinite(gradeFk) ? gradeFk : undefined
  }

  /** Whether the pin actually moved. It can stay put and still be a change: confirming an
   *  estimated pin rewrites the flag alone, and "Moved 0 m" would be a silly way to say so. */
  const relocated = (from: null | StoredCoords, to: null | StoredCoords) =>
    from != null && to != null && (from.lat !== to.lat || from.long !== to.long)

  /** What the pins on the thumbnail are: where it was, where it is, or where it used to be. */
  const locationPoints = (from: null | StoredCoords, to: null | StoredCoords): StaticMapPoint[] => [
    ...(from == null ? [] : [{ ...from, variant: to == null ? ('gone' as const) : ('from' as const) }]),
    ...(to == null ? [] : [{ ...to, variant: 'pin' as const }]),
  ]

  /** The line under the map, and the whole row for the rows that stored no coordinates. */
  const locationCaption = (renderer: string, from: null | StoredCoords, to: null | StoredCoords) => {
    if (renderer === 'locationRemoved') {
      return m.activity_changeLocationRemoved()
    }
    // A location row written before the writers stored coordinates. Still true, just as vague
    // as it always was.
    if (to == null) {
      return m.activity_changeLocationUpdated()
    }
    if (from == null) {
      return m.activity_changeLocationSet()
    }
    return relocated(from, to)
      ? m.activity_changeLocationMoved({ distance: formatDistance(from, to) })
      : m.activity_changeLocationConfirmed()
  }
</script>

{#snippet chip(value: string | undefined)}
  <span
    class={[
      'inline-flex max-w-full items-center truncate rounded-lg px-2 py-0.5 text-xs',
      value == null || value.length === 0
        ? 'text-surface-600-400 bg-surface-200-800/50 italic'
        : 'bg-surface-200-800 text-surface-950-50',
    ]}
  >
    {value == null || value.length === 0 ? m.activity_valueNotSet() : value}
  </span>
{/snippet}

{#snippet arrow()}
  <Icon name="arrow-right" size={13} class="text-surface-600-400 flex-none" />
{/snippet}

{#snippet gradeChip(value: string | undefined)}
  {@const gradeFk = grade(value)}
  {#if gradeFk == null}
    {@render chip(undefined)}
  {:else}
    <RouteGrade band={getGradeBand(gradeFk)} grade={gradeLabel(global.grades, global.gradingScale, gradeFk)} />
  {/if}
{/snippet}

{#snippet value(activity: ActivityListItem, renderer: string)}
  {#if renderer === 'grade'}
    {@render gradeChip(activity.oldValue)}
    {@render arrow()}
    {@render gradeChip(activity.newValue)}
  {:else if renderer === 'rating'}
    <RouteRating rating={Number(activity.oldValue ?? 0)} />
    {@render arrow()}
    <RouteRating rating={Number(activity.newValue ?? 0)} />
  {:else if renderer === 'tags'}
    {@const before = new Set(list(activity.oldValue))}
    {@const after = new Set(list(activity.newValue))}
    {#each [...after].filter((tag) => !before.has(tag)) as tag (tag)}
      <span class="preset-tonal-success rounded-lg px-2 py-0.5 text-xs">{m.activity_changeTagAdded({ tag })}</span>
    {/each}
    {#each [...before].filter((tag) => !after.has(tag)) as tag (tag)}
      <span class="preset-tonal-error rounded-lg px-2 py-0.5 text-xs">{m.activity_changeTagRemoved({ tag })}</span>
    {/each}
  {:else if renderer === 'chips'}
    {#each list(activity.oldValue) as entry (entry)}{@render chip(entry)}{:else}{@render chip(undefined)}{/each}
    {@render arrow()}
    {#each list(activity.newValue) as entry (entry)}{@render chip(entry)}{:else}{@render chip(undefined)}{/each}
  {:else if renderer === 'prose'}
    <!-- Long text never fits the line, so it collapses behind its own length. -->
    <details class="min-w-0">
      <summary class="text-surface-600-400 cursor-pointer text-xs">
        {m.activity_compareCharacters({ count: (activity.newValue ?? '').length })}
      </summary>
      <div class="mt-1.5 space-y-1.5 text-xs">
        <p class="text-surface-600-400 line-through">{activity.oldValue || m.activity_valueNotSet()}</p>
        <p class="text-surface-950-50 whitespace-pre-wrap">{activity.newValue || m.activity_valueNotSet()}</p>
      </div>
    </details>
  {:else if renderer === 'location' || renderer === 'locationRemoved'}
    {@const from = parseCoords(activity.oldValue)}
    {@const to = parseCoords(activity.newValue)}
    {@const points = locationPoints(from, to)}
    <!-- ponytail: the thumbnail is a fixed 200px, so a very narrow card crops its right edge.
         Upgrade = measure the container and pass the width in. -->
    <div class="flex min-w-0 flex-col gap-1.5">
      {#if points.length > 0}
        <StaticMap height={120} {points} width={200} />
      {/if}

      <span class="flex flex-wrap items-center gap-1.5">
        <span class="text-surface-600-400 text-xs">{locationCaption(renderer, from, to)}</span>
        <!-- A pin that stays approximate says so. One that stops being approximate does not
             need a second line: the caption already reads "confirmed", or the ring on the
             thumbnail simply went solid. -->
        {#if to?.estimated}
          <span class="bg-surface-200-800 text-surface-950-50 rounded-lg px-2 py-0.5 text-xs">
            {m.activity_changeLocationApproximate()}
          </span>
        {/if}
      </span>
    </div>
  {:else if renderer === 'topo'}
    <span class="text-surface-600-400 text-xs">{m.activity_changeTopoUpdated()}</span>
  {:else if renderer === 'file'}
    <span class="text-surface-600-400 text-xs">{m.activity_changeFileRemoved()}</span>
  {:else}
    {@render chip(activity.oldValue)}
    {@render arrow()}
    {@render chip(activity.newValue)}
  {/if}
{/snippet}

{#if changes.length > 0}
  <ul class="border-surface-200-800 space-y-2 border-t pt-2.5">
    {#each changes as { activity, field } (activity.id)}
      <li class="flex items-start gap-2">
        <span class="text-surface-600-400 mt-0.5 flex-none"><Icon name={field.icon} size={14} /></span>

        <span class="text-surface-600-400 mt-0.5 w-24 flex-none text-xs font-semibold">
          {resolveMessage(field.labelKey)}
        </span>

        <span class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {@render value(activity, field.renderer)}
        </span>
      </li>
    {/each}
  </ul>
{/if}
