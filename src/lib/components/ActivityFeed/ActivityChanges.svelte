<!--
  The expanded half of an activity card: one line per changed column, rendered by the
  renderer its catalogue entry assigns it rather than by a per-column component. An entry
  that declares no `field` carries no old/new pair, so it simply does not appear.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import { storedMedia, type ActivityChange, type ActivityTopoChange } from '$lib/entities/activity/card'
  import { sourceHost } from '$lib/entities/file/upload'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { assignableRoles, type AppRole } from '$lib/entities/rolePermission/dto'
  import { roleLabel } from '$lib/entities/rolePermission/mapper'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import type { TopoAction, TopoLineState } from '$lib/entities/topo/change'
  import type { TopoView } from '$lib/entities/topo/dto'
  import { convertPathToPoints } from '$lib/entities/topo/mapper'
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

  /** The member list's label for a stored role, or the raw value when it is not one of the
   *  three the app assigns. `roleLabel` answers "Admin" for anything it does not recognise, so
   *  the membership check has to happen out here. */
  const roleName = (value: string | undefined) =>
    assignableRoles.includes(value as (typeof assignableRoles)[number]) ? roleLabel(value as AppRole) : value

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

  /** What the topo change was. The four photo actions each say their own thing; a redraw
   *  lets the line chips below speak, and only says "Lines updated" when it has no chips
   *  to show (a row from before the lines were stored, or one whose routes are gone). */
  const topoCaption = (action: TopoAction, hasLines: boolean) => {
    switch (action) {
      case 'lines':
        return hasLines ? undefined : m.activity_changeTopoLinesUpdated()
      case 'photoAdded':
        return m.activity_changeTopoPhotoAdded()
      case 'photoRemoved':
        // Same sentence a removed route photo gets: it is the same event to a reader. Always
        // a photo here, since a topo is an image.
        return m.activity_changeFileRemoved({ media: 'photo' })
      case 'photoReplaced':
        return m.activity_changeTopoPhotoReplaced()
      case 'reordered':
        return m.activity_changeTopoReordered()
    }
  }

  /** A line's route, or the placeholder a route saved without a name renders as everywhere else. */
  const lineName = (line: TopoLineState) => (line.name.length === 0 ? m.common_unnamed() : line.name)

  /** The grade colour a line had. Off the photo as it stands today, which is the only place
   *  a grade lives: an erased line falls back to the neutral band, and it is a ghost anyway. */
  const lineBand = (topo: TopoView | undefined, routeFk: number) =>
    getGradeBand(topo?.lines.find((line) => line.routeId === routeFk)?.gradeFk)

  /**
   * Both ends of a redraw on one photo: the lines the save left behind, and under them,
   * dashed, the ones it moved or erased.
   *
   * Drawn from the row rather than from the photo's lines today, so a card keeps saying what
   * that edit did however much the topo has moved on since. Ghost ids are negated to keep
   * them apart from the live line for the same route, which sits right on top of them.
   */
  const topoLines = ({ lines, view }: ActivityTopoChange) => {
    const draw = (states: TopoLineState[], ghost: boolean) =>
      states.flatMap((line) => {
        const points = convertPathToPoints(line.path)
        return points.length === 0
          ? []
          : [
              {
                band: ghost ? undefined : lineBand(view, line.routeFk),
                ghost,
                id: ghost ? -line.routeFk : line.routeFk,
                points,
                topType: line.topType === 'topout' ? ('topout' as const) : ('top' as const),
              },
            ]
      })

    return [...draw(lines.previous, true), ...draw(lines.current, false)]
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

{#snippet value({ activity, field, topo }: ActivityChange)}
  {@const renderer = field.renderer}
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
    {#if topo == null}
      <!-- A topo row from before the writers said which of the five topo edits they were.
           Still true, just as vague as it always was. -->
      <span class="text-surface-600-400 text-xs">{m.activity_changeTopoUpdated()}</span>
    {:else}
      {@const lines = topo.lines}
      {@const view = topo.view}
      {@const caption = topoCaption(
        topo.change.action,
        lines.added.length + lines.redrawn.length + lines.removed.length > 0,
      )}
      <div class="flex min-w-0 flex-col gap-1.5">
        <!-- A redraw draws its own before and after; the photo actions have no pair to show,
             so they draw the photo as it stands. A removed photo has no image left either
             way, and a reorder is about the strip rather than any one photo in it. -->
        {#if view != null}
          <!-- `self-start`: the column stretches its children, which would hold the box at the
               card's width while the photo contains itself inside it, in a frame of dark bars. -->
          <Topo
            alt={m.topo_alt()}
            class="h-40 w-auto self-start"
            height={view.imageHeight}
            imagePath={view.imagePath}
            lines={topo.change.action === 'lines'
              ? topoLines(topo)
              : view.lines.map((line) => ({
                  band: getGradeBand(line.gradeFk),
                  id: line.id,
                  points: line.points,
                  topType: line.topType,
                }))}
            width={view.imageWidth}
          />
        {/if}

        <span class="flex flex-wrap items-center gap-1.5">
          {#if caption != null}
            <span class="text-surface-600-400 text-xs">{caption}</span>
          {/if}

          {#each lines.added as line (line.routeFk)}
            <span class="preset-tonal-success rounded-lg px-2 py-0.5 text-xs">
              {m.activity_changeTopoLineAdded({ route: lineName(line) })}
            </span>
          {/each}

          {#each lines.redrawn as line (line.routeFk)}
            <span class="bg-surface-200-800 text-surface-950-50 rounded-lg px-2 py-0.5 text-xs">
              {m.activity_changeTopoLineRedrawn({ route: lineName(line) })}
            </span>
          {/each}

          {#each lines.removed as line (line.routeFk)}
            <span class="preset-tonal-error rounded-lg px-2 py-0.5 text-xs">
              {m.activity_changeTopoLineRemoved({ route: lineName(line) })}
            </span>
          {/each}
        </span>
      </div>
    {/if}
  {:else if renderer === 'role'}
    <!-- `region_maintainer` is what the column stores, not what anybody should read. Anything
         outside the enum (a legacy or hand-inserted row) stands as stored rather than being
         mislabelled as one of the three. -->
    {@render chip(roleName(activity.oldValue))}
    {@render arrow()}
    {@render chip(roleName(activity.newValue))}
  {:else if renderer === 'source'}
    <!-- The host, not the URL: a reposted clip's credit is "youtube.com", and the full link
         would be a line of query string in a chip. A legacy free-text source has no host to
         reduce to, so it stands as it was stored. -->
    {@render chip(sourceHost(activity.oldValue) ?? activity.oldValue)}
    {@render arrow()}
    {@render chip(sourceHost(activity.newValue) ?? activity.newValue)}
  {:else if renderer === 'file'}
    <span class="text-surface-600-400 text-xs">
      {m.activity_changeFileRemoved({ media: storedMedia(activity.oldValue) })}
    </span>
  {:else}
    {@render chip(activity.oldValue)}
    {@render arrow()}
    {@render chip(activity.newValue)}
  {/if}
{/snippet}

{#if changes.length > 0}
  <ul class="border-surface-200-800 space-y-2 border-t pt-2.5">
    {#each changes as change (change.activity.id)}
      <li class="flex items-start gap-2">
        <span class="text-surface-600-400 mt-0.5 flex-none"><Icon name={change.field.icon} size={14} /></span>

        <span class="text-surface-600-400 mt-0.5 w-24 flex-none text-xs font-semibold">
          <!-- Only the file label reads `media`; every other one ignores it, the way the
               headline params already work. -->
          {resolveMessage(change.field.labelKey, { media: storedMedia(change.activity.oldValue) })}
        </span>

        <span class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {@render value(change)}
        </span>
      </li>
    {/each}
  </ul>
{/if}
