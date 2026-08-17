<!--
  The expanded half of an activity card: one line per changed column.

  What a line SAYS is decided by `changeViews()` and arrives as a view; this file is the
  markup for it, one snippet per kind. What stays here is what genuinely needs the reader:
  their locale, their unit preference, their grading scale, and the copy behind a message key.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import { ASCENT_TYPES, STATUS } from '$lib/entities/ascent/AscentType.svelte'
  import AscentTypeGlyph from '$lib/entities/ascent/AscentTypeGlyph.svelte'
  import type { ChangeView, PairFormat, SourceSide } from '$lib/entities/event/change'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { roleLabelFor } from '$lib/entities/rolePermission/mapper'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatDate } from '$lib/i18n/relativeTime'
  import { formatCelsius, formatHumidity } from '$lib/i18n/units.svelte'
  import { formatMetres } from '$lib/map/map'
  import StaticMap from '$lib/map/StaticMap.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    /** The card's changed columns, already decided by `changeViews`. */
    changes: readonly ChangeView[]
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

  /** A stored number, or undefined for the rows that cleared the field. */
  const numeric = (value: string | undefined) => {
    const parsed = value == null || value.length === 0 ? NaN : Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  /**
   * How a stored value reads once it is a chip, for the pairs that are not plain text. Keyed by
   * the format its catalogue entry declares, so a new formatted column is an entry here rather
   * than a branch below.
   *
   * Every one of them falls back to the raw value. A legacy row, a hand-inserted one, or a
   * column whose stored shape has moved on is better shown as stored than mislabelled.
   */
  const FORMATTERS: Record<PairFormat, (value: string | undefined) => string | undefined> = {
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
    text: (value) => value,
  }

  /** A line's route, or the placeholder a route saved without a name renders as everywhere else. */
  const lineName = (name: string) => (name.length === 0 ? m.common_unnamed() : name)
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
    {value == null || value.length === 0 ? m.event_valueNotSet() : value}
  </span>
{/snippet}

{#snippet arrow()}
  <Icon name="arrow-right" size={13} class="text-surface-600-400 flex-none" />
{/snippet}

<!-- The host stands for the URL, and the URL is worth following: a reader looking at "who
     reposted this" usually wants the clip. Only a value that parsed as a URL becomes a link,
     so a legacy free-text source stays a plain chip. -->
{#snippet sourceChip(side: SourceSide)}
  {#if side.host == null}
    {@render chip(side.value)}
  {:else}
    <!-- No icon in the chip: the row's own label already carries the link glyph. -->
    <a
      class="bg-surface-200-800 text-surface-950-50 inline-flex max-w-full items-center truncate rounded-lg px-2 py-0.5 text-xs underline decoration-dotted underline-offset-2"
      href={side.value}
      rel="noreferrer noopener"
      target="_blank"
      title={side.value}
    >
      {side.host}
    </a>
  {/if}
{/snippet}

<!-- The glyph the route row and the log form already use, plus the word that picker offers.
     A stored value that is no longer one of the four (a row written before `send` became
     `redpoint`) has neither, and shows as stored rather than as nothing at all.

     The bare glyph rather than the badge, the way the form's type picker draws it: the badge
     names itself for a screen reader ("Flashed"), and beside a word that already says "Flash"
     a reader heard the type twice in two different tenses. -->
{#snippet ascentTypeChip(value: string | undefined)}
  {@const status = ASCENT_TYPES.find((entry) => entry.type === value)}
  {#if status == null}
    {@render chip(value)}
  {:else}
    <span class="inline-flex max-w-full min-w-0 items-center gap-1.5">
      <!-- No colour on the wrapper: the glyph paints its own fill and stroke from the type. -->
      <span class="flex-none"><AscentTypeGlyph info={STATUS[status.type]} /></span>
      <span class="text-surface-950-50 truncate text-xs">{status.label()}</span>
    </span>
  {/if}
{/snippet}

{#snippet gradeChip(gradeFk: number | undefined)}
  {#if gradeFk == null}
    {@render chip(undefined)}
  {:else}
    <RouteGrade band={getGradeBand(gradeFk)} grade={gradeLabel(global.grades, global.gradingScale, gradeFk)} />
  {/if}
{/snippet}

{#snippet value(change: ChangeView)}
  {#if change.kind === 'ascentType'}
    {@render ascentTypeChip(change.before)}
    {@render arrow()}
    {@render ascentTypeChip(change.after)}
  {:else if change.kind === 'grade'}
    {@render gradeChip(change.beforeFk)}
    {@render arrow()}
    {@render gradeChip(change.afterFk)}
  {:else if change.kind === 'rating'}
    <RouteRating rating={change.before} />
    {@render arrow()}
    <RouteRating rating={change.after} />
  {:else if change.kind === 'tags'}
    {#each change.added as tag (tag)}
      <span class="preset-tonal-success rounded-lg px-2 py-0.5 text-xs">{m.event_changeTagAdded({ tag })}</span>
    {/each}
    {#each change.removed as tag (tag)}
      <span class="preset-tonal-error rounded-lg px-2 py-0.5 text-xs">{m.event_changeTagRemoved({ tag })}</span>
    {/each}
  {:else if change.kind === 'chips'}
    {#each change.before as entry (entry)}{@render chip(entry)}{:else}{@render chip(undefined)}{/each}
    {@render arrow()}
    {#each change.after as entry (entry)}{@render chip(entry)}{:else}{@render chip(undefined)}{/each}
  {:else if change.kind === 'prose'}
    <!-- Long text never fits the line, so it collapses behind its own length. -->
    <details class="min-w-0">
      <summary class="text-surface-600-400 cursor-pointer text-xs">
        {m.event_compareCharacters({ count: (change.after ?? '').length })}
      </summary>
      <!-- One merged text when both sides have one, so the edit points at itself instead of
           leaving the reader to compare two near-identical paragraphs. Source rather than
           rendered markdown: see `proseDiff`. -->
      <div class="mt-1.5 text-xs">
        {#if change.segments != null}
          <!-- No whitespace between a tag and its text: the paragraph preserves what it is
               given, so an indented `{segment.value}` would put the markup's own newlines
               inside the sentence. The classes are named above for the same reason, to keep
               each element on one line. -->
          <p class="text-surface-600-400 whitespace-pre-wrap">
            {#each change.segments as segment, index (index)}
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
              {#if change.before}
                <p class="whitespace-pre-wrap">{change.before}</p>
              {:else}
                <p>{m.event_valueNotSet()}</p>
              {/if}
            </div>
            <div class="text-surface-950-50">
              {#if change.after}
                <p class="whitespace-pre-wrap">{change.after}</p>
              {:else}
                <p>{m.event_valueNotSet()}</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </details>
  {:else if change.kind === 'location'}
    <!-- ponytail: the thumbnail is a fixed 200px, so a very narrow card crops its right edge.
         Upgrade = measure the container and pass the width in. -->
    <div class="flex min-w-0 flex-col gap-1.5">
      {#if change.points.length > 0}
        <StaticMap height={120} paths={change.paths} points={change.points} width={200} />
      {/if}

      <span class="flex flex-wrap items-center gap-1.5">
        <!-- Only the "moved" sentence carries a distance; the other four ignore the param, the
             way the headline params already work. The unit is the reader's. -->
        <span class="text-surface-600-400 text-xs">
          {resolveMessage(change.captionKey, {
            distance: change.metres == null ? '' : formatMetres(change.metres),
          })}
        </span>
        <!-- A pin that stays approximate says so. One that stops being approximate does not
             need a second line: the caption already reads "confirmed", or the ring on the
             thumbnail simply went solid. -->
        {#if change.approximate}
          <span class="bg-surface-200-800 text-surface-950-50 rounded-lg px-2 py-0.5 text-xs">
            {m.event_changeLocationApproximate()}
          </span>
        {/if}
      </span>
    </div>
  {:else if change.kind === 'topo'}
    <div class="flex min-w-0 flex-col gap-1.5">
      <!-- A redraw draws its own before and after; the photo actions draw the photo as it
           stands. A removed photo has no image left either way, and a reorder is about the
           strip rather than any one photo in it. -->
      {#if change.image != null}
        <!-- `self-start`: the column stretches its children, which would hold the box at the
             card's width while the photo contains itself inside it, in a frame of dark bars. -->
        <Topo
          alt={m.topo_alt()}
          class="h-40 w-auto self-start"
          height={change.image.height}
          imagePath={change.image.path}
          lines={change.lines}
          width={change.image.width}
        />
      {/if}

      <span class="flex flex-wrap items-center gap-1.5">
        {#if change.captionKey != null}
          <!-- A pulled topo photo shares the sentence a pulled route photo gets, and a topo is
               always an image; every other caption ignores the param. -->
          <span class="text-surface-600-400 text-xs">
            {resolveMessage(change.captionKey, { media: 'photo' })}
          </span>
        {/if}

        {#each change.added as line (line.routeFk)}
          <span class="preset-tonal-success rounded-lg px-2 py-0.5 text-xs">
            {m.event_changeTopoLineAdded({ route: lineName(line.name) })}
          </span>
        {/each}

        {#each change.redrawn as line (line.routeFk)}
          <span class="bg-surface-200-800 text-surface-950-50 rounded-lg px-2 py-0.5 text-xs">
            {m.event_changeTopoLineRedrawn({ route: lineName(line.name) })}
          </span>
        {/each}

        {#each change.removed as line (line.routeFk)}
          <span class="preset-tonal-error rounded-lg px-2 py-0.5 text-xs">
            {m.event_changeTopoLineRemoved({ route: lineName(line.name) })}
          </span>
        {/each}
      </span>
    </div>
  {:else if change.kind === 'source'}
    <!-- The host, not the URL: a reposted clip's credit is "youtube.com", and the full link
         would be a line of query string in a chip. -->
    {@render sourceChip(change.before)}
    {@render arrow()}
    {@render sourceChip(change.after)}
  {:else if change.kind === 'file'}
    <span class="text-surface-600-400 text-xs">{m.event_changeFileRemoved({ media: change.media })}</span>
  {:else}
    <!-- The plain pair, read through the formatter its entry declares. -->
    {@const format = FORMATTERS[change.format]}
    {@render chip(format(change.before))}
    {@render arrow()}
    {@render chip(format(change.after))}
  {/if}
{/snippet}

{#if changes.length > 0}
  <ul class="border-surface-200-800 space-y-2 border-t pt-2.5">
    {#each changes as change (change.id)}
      <li class="flex items-start gap-2">
        <span class="text-surface-600-400 mt-0.5 flex-none"><Icon name={change.field.icon} size={14} /></span>

        <span class="text-surface-600-400 mt-0.5 w-24 flex-none text-xs font-semibold">
          <!-- Only the file label reads `media`; every other one ignores it. -->
          {resolveMessage(change.field.labelKey, change.labelParams)}
        </span>

        <span class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {@render value(change)}
        </span>
      </li>
    {/each}
  </ul>
{/if}
