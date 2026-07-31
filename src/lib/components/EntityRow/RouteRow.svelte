<script lang="ts">
  import { ENTITY_TYPE_ICON } from '$lib/components/EntitySearch/search.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Image from '$lib/components/Image/Image.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import AscentType from '$lib/entities/ascent/AscentType.svelte'
  import { getGradeBand, gradeFgVar, gradeVar } from '$lib/entities/grade/color'
  import type { RouteListItem } from '$lib/entities/route/dto'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import RouteTags from '$lib/entities/route/RouteTags.svelte'
  import { buildLine, isNormalized } from '$lib/entities/topo/path'
  import { m } from '$lib/paraglide/messages.js'
  import type { Snippet } from 'svelte'
  import Row from './Row.svelte'
  import type { AscentStatus } from './types'

  /** The slice of a route the row renders — a `RouteListItem` satisfies it. */
  type RouteRowData = Pick<
    RouteListItem,
    'description' | 'gradeFk' | 'name' | 'rating' | 'tags' | 'topoImagePath' | 'topoPoints'
  >

  interface Props {
    /** Trailing action inside the card (e.g. a remove button). */
    action?: Snippet
    /** Selected state — highlights the card and expands the tags/actions line. */
    active?: boolean
    /** Breadcrumb path, e.g. "Roadside · The Arch". */
    crumbs?: string | string[]
    /** Pre-resolved route detail href — the "Details" action of the expanded row. */
    detailsHref?: string
    /** Display grade in the user's scale, e.g. "7a+". */
    grade: string
    /** Render as a link. */
    href?: string
    /** Pre-resolved block detail href — the "Show on map" action of the expanded row. */
    mapHref?: string
    /** Guidebook line number — shown in the thumb instead of a topo preview. */
    number?: number
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /** The route: name, grade band (via `gradeFk`), stars, description and topo thumbnail. */
    route: RouteRowData
    /** The user's logged ascent state, if any. */
    status?: AscentStatus
  }

  let {
    action,
    active = false,
    crumbs,
    detailsHref,
    grade,
    href,
    mapHref,
    number,
    onclick,
    route,
    status,
  }: Props = $props()

  // The selected card grows an extra line (tags + actions) — only when there's
  // something to put in it.
  const expanded = $derived(active && (route.tags.length > 0 || mapHref != null || detailsHref != null))

  const band = $derived(getGradeBand(route.gradeFk))
  const bandColor = $derived(gradeVar(band))
  const bandFg = $derived(gradeFgVar(band))

  const hasTopo = $derived(route.topoImagePath != null && route.topoPoints != null && route.topoPoints.length > 0)

  // Bound to the loaded image's intrinsic size: the topo line points resolve
  // against it (fractions scale to it, legacy pixels use it as the viewBox), and
  // `xMidYMid slice` on the SVG matches the image's `object-cover` centre-crop so
  // the overlay stays aligned. 0 until the image loads → overlay hidden.
  let naturalWidth = $state(0)
  let naturalHeight = $state(0)

  // Only normalized (0–1) paths can be drawn here: the tile loads a resized
  // preview, and legacy pixel paths are in the original photo's coordinate
  // space, whose dimensions aren't stored — there's no way to scale them to the
  // preview. Those rows show the plain photo without a line.
  // ponytail: fixes itself once legacy paths are migrated to 0–1 fractions.
  const line = $derived(
    route.topoPoints != null && isNormalized(route.topoPoints)
      ? buildLine(route.topoPoints, true, naturalWidth, naturalHeight)
      : null,
  )
</script>

{#snippet title()}
  <span class="name-row">
    <span class="title-md ellipsis">{route.name}</span>
  </span>
{/snippet}

{#snippet body()}
  {#if route.description}
    <Markdown className="short" disableLinks encloseReferences="strong" markdown={route.description} />
  {/if}
{/snippet}

{#snippet footer()}
  <!-- Wrapping container: when tags + buttons don't fit one line, the buttons
       group drops below the tags (ms-auto keeps it right-aligned) instead of
       squeezing the tags into a one-per-line column. -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <RouteTags tags={route.tags} />

    <div class="ms-auto flex flex-none items-center gap-1.5">
      {#if mapHref}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers resolve() the href -->
        <a class="btn btn-sm preset-tonal" href={mapHref}>
          <Icon name="map-pin" size={13} />
          {m.routes_showOnMap()}
        </a>
      {/if}
      {#if detailsHref}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers resolve() the href -->
        <a class="btn btn-sm preset-filled-primary-500" href={detailsHref}>
          {m.routes_showDetails()}
          <Icon name="chevron-right" size={13} />
        </a>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet rightContent()}
  <div class="flex flex-col items-end justify-center gap-2">
    <div class="flex">
      <AscentType {status} />
      <RouteGrade {band} {grade} />
    </div>

    <RouteRating rating={route.rating} />
  </div>
{/snippet}

<Row
  {action}
  {active}
  {crumbs}
  {href}
  {onclick}
  {rightContent}
  {title}
  description={body}
  footer={expanded ? footer : undefined}
  variant="card"
>
  <span class="thumb bg-surface-200-800">
    {#if number != null}
      <span
        class="absolute inset-0 grid place-items-center font-mono text-lg font-bold"
        style:background-color={bandColor}
        style:color={bandFg}
      >
        {number}
      </span>
    {:else if hasTopo && route.topoImagePath != null}
      <!-- 52px tile at up to ~3x DPR → request a small thumbnail, not the full-res photo. -->
      <Image
        path={route.topoImagePath}
        alt=""
        class="h-full w-full"
        previewWidth={256}
        bind:naturalWidth
        bind:naturalHeight
      />
      {#if naturalWidth > 0 && naturalHeight > 0 && line != null}
        <svg
          class="absolute inset-0 h-full w-full"
          viewBox="0 0 {naturalWidth} {naturalHeight}"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <path
            d={line.d}
            stroke="oklch(0 0 0 / 0.55)"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
          <path
            d={line.d}
            stroke={bandColor}
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      {/if}
    {:else}
      <span class="text-surface-500 absolute inset-0 grid place-items-center" aria-hidden="true">
        <Icon name={ENTITY_TYPE_ICON.routes} size={24} />
      </span>
    {/if}
  </span>
</Row>

<style>
  .title-md {
    font-size: 15.5px;
    font-weight: 650;
  }

  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .thumb {
    width: 52px;
    height: 52px;
    flex: none;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
  }
</style>
