<!--
  The expanded half of an activity card: one line per changed column, rendered by the
  type `fields.ts` assigns it rather than by a per-column component. Columns nothing
  writes yet (or that carry no old/new pair) simply do not appear.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ActivityChange } from '$lib/entities/activity/card'
  import type { ActivityDto } from '$lib/entities/activity/dto'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import { resolveMessage } from '$lib/i18n/message'
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

{#snippet value(activity: ActivityDto, renderer: string)}
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
  {:else if renderer === 'location'}
    <!-- ponytail: the writers store no coordinates (see the plan's gap 2), so this can
         only say that it moved. Upgrade = put the pair in oldValue/newValue, then a map thumb. -->
    <span class="text-surface-600-400 text-xs">{m.activity_changeLocationUpdated()}</span>
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
