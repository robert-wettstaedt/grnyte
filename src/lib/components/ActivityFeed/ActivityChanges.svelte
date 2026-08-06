<!--
  The expanded half of an activity card: one line per changed column, rendered by the
  renderer its catalogue entry assigns it rather than by a per-column component. An entry
  that declares no `field` carries no old/new pair, so it simply does not appear.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import { storedMedia, type ActivityChange, type ActivityTopoChange } from '$lib/entities/activity/card'
  import type { ChangeRenderer } from '$lib/entities/activity/verbs'
  import { sourceHost } from '$lib/entities/file/upload'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { roleLabelFor } from '$lib/entities/rolePermission/mapper'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import type { TopoAction, TopoLineState } from '$lib/entities/topo/change'
  import type { TopoView } from '$lib/entities/topo/dto'
  import { convertPathToPoints } from '$lib/entities/topo/mapper'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatDate } from '$lib/i18n/relativeTime'
  import { formatCelsius, formatHumidity } from '$lib/i18n/units.svelte'
  import { parseCoords, type StoredCoords } from '$lib/map/coords'
  import { formatDistance } from '$lib/map/map'
  import StaticMap, { type StaticMapPoint } from '$lib/map/StaticMap.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    /** The card's changed columns, already paired with their registry entry by `activityCard`. */
    changes: readonly ActivityChange[]
  }

  const { changes }: Props = $props()

  const global = getGlobalState()

  /** The two halves of a prose diff. Named so each element fits on one line: the paragraph
   *  around them preserves whitespace, so a wrapped tag would leak its indentation into the
   *  sentence. The margin sits on the removed half alone, because `diffWords` hands back a
   *  replaced word and its replacement with nothing between them while every other boundary
   *  already carries the space it had in the text. */
  const ADDED_WORDS = 'bg-success-500/25 text-surface-950-50 rounded-sm px-0.5 no-underline'
  const REMOVED_WORDS = 'text-surface-600-400/70 mr-0.5 decoration-1'

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

  /** A stored number, or undefined for the rows that cleared the field. */
  const numeric = (value: string | undefined) => {
    const parsed = value == null || value.length === 0 ? NaN : Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const identity = (value: string | undefined) => value

  /**
   * How a stored value reads once it is a chip, for the columns that are a plain old/new pair
   * but not plain text. Keyed by renderer, so a new formatted column is an entry here rather
   * than another branch in the chain below.
   *
   * Every one of them falls back to the raw value. A legacy row, a hand-inserted one, or a
   * column whose stored shape has moved on is better shown as stored than mislabelled.
   */
  const FORMATTERS: Partial<Record<ChangeRenderer, (value: string | undefined) => string | undefined>> = {
    // The ascent date, stored as `YYYY-MM-DD` and meaning a calendar day. Parsed as UTC and
    // formatted as UTC by `formatDate`, which is what keeps it off the day before for readers
    // west of Greenwich; reading it back raw put an ISO string in a feed of localised dates.
    date: (value) => {
      const parsed = value == null || value.length === 0 ? NaN : Date.parse(`${value}T00:00:00Z`)
      return Number.isFinite(parsed) ? formatDate(parsed, getLocale()) : value
    },
    humidity: (value) => {
      const humidity = numeric(value)
      return humidity == null ? value : formatHumidity(humidity)
    },
    // `region_maintainer` is what the column stores, not what anybody should read.
    role: (value) => roleLabelFor(value) ?? value,
    temperature: (value) => {
      const celsius = numeric(value)
      return celsius == null ? value : formatCelsius(celsius)
    },
  }

  /** Whether the pin actually moved. It can stay put and still be a change: confirming an
   *  estimated pin rewrites the flag alone, and "Moved 0 m" would be a silly way to say so. */
  const relocated = (from: null | StoredCoords, to: null | StoredCoords) =>
    from != null && to != null && (from.lat !== to.lat || from.long !== to.long)

  /** What the pins on the thumbnail are: where it was, where it is, or where it used to be.
   *  `estimated` rides along so a guessed pin is marked here the way it is on the real map. */
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

<!-- eslint-disable svelte/no-navigation-without-resolve -- the one href in this file is a
     stored video source, which is off-site by definition and has no route to resolve. -->

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

<!-- The host stands for the URL, and the URL is worth following: a reader looking at "who
     reposted this" usually wants the clip. Only a value that parsed as a URL becomes a link,
     so a legacy free-text source stays a plain chip. -->
{#snippet sourceChip(value: string | undefined)}
  {@const host = sourceHost(value)}
  {#if host == null}
    {@render chip(value)}
  {:else}
    <!-- No icon in the chip: the row's own label already carries the link glyph. -->
    <a
      class="bg-surface-200-800 text-surface-950-50 inline-flex max-w-full items-center truncate rounded-lg px-2 py-0.5 text-xs underline decoration-dotted underline-offset-2"
      href={value}
      rel="noreferrer noopener"
      target="_blank"
      title={value}
    >
      {host}
    </a>
  {/if}
{/snippet}

{#snippet gradeChip(value: string | undefined)}
  {@const gradeFk = grade(value)}
  {#if gradeFk == null}
    {@render chip(undefined)}
  {:else}
    <RouteGrade band={getGradeBand(gradeFk)} grade={gradeLabel(global.grades, global.gradingScale, gradeFk)} />
  {/if}
{/snippet}

{#snippet value({ activity, field, paths, prose, topo }: ActivityChange)}
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
      <!-- One merged text when both sides have one, so the edit points at itself instead of
           leaving the reader to compare two near-identical paragraphs. Source rather than
           rendered markdown: see `proseDiff`. -->
      <div class="mt-1.5 text-xs">
        {#if prose != null}
          <!-- No whitespace between a tag and its text: the paragraph preserves what it is
               given, so an indented `{segment.value}` would put the markup's own newlines
               inside the sentence. The classes are named above for the same reason, to keep
               each element on one line. -->
          <p class="text-surface-600-400 whitespace-pre-wrap">
            {#each prose as segment, index (index)}
              {#if segment.kind === 'added'}
                <ins class={ADDED_WORDS}>{segment.value}</ins>
              {:else if segment.kind === 'removed'}
                <del class={REMOVED_WORDS}>{segment.value}</del>
              {:else}{segment.value}{/if}
            {/each}
          </p>
        {:else}
          <!-- Filled from nothing, or cleared. "Not set" against the text is the whole story,
               and a diff of it would be one long stripe of a single colour. -->
          <div class="space-y-1.5">
            <div class="text-surface-600-400 line-through">
              {#if activity.oldValue}
                <p class="whitespace-pre-wrap">{activity.oldValue}</p>
              {:else}
                <p>{m.activity_valueNotSet()}</p>
              {/if}
            </div>
            <div class="text-surface-950-50">
              {#if activity.newValue}
                <p class="whitespace-pre-wrap">{activity.newValue}</p>
              {:else}
                <p>{m.activity_valueNotSet()}</p>
              {/if}
            </div>
          </div>
        {/if}
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
        <StaticMap height={120} {paths} {points} width={200} />
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
  {:else if renderer === 'source'}
    <!-- The host, not the URL: a reposted clip's credit is "youtube.com", and the full link
         would be a line of query string in a chip. A legacy free-text source has no host to
         reduce to, so it stands as it was stored. -->
    {@render sourceChip(activity.oldValue)}
    {@render arrow()}
    {@render sourceChip(activity.newValue)}
  {:else if renderer === 'file'}
    <span class="text-surface-600-400 text-xs">
      {m.activity_changeFileRemoved({ media: storedMedia(activity.oldValue) })}
    </span>
  {:else}
    <!-- The plain pair, and with it every renderer that is only a plain pair read through a
         formatter (date, temperature, humidity, role). Those had a branch each, identical but
         for the function they called, so a new formatted column meant a new branch and a
         restyle of the pair meant editing five. -->
    {@const format = FORMATTERS[renderer] ?? identity}
    {@render chip(format(activity.oldValue))}
    {@render arrow()}
    {@render chip(format(activity.newValue))}
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
