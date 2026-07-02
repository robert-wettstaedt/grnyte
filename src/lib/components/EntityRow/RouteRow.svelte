<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Image from '$lib/components/Image/Image.svelte'
  import { gradeFgVar, gradeVar, type GradeBand } from '$lib/entities/grade/color'
  import type { TopoPoint } from '$lib/entities/topo/dto'
  import { buildLine, isNormalized } from '$lib/entities/topo/path'
  import { starString, statusInfo, type StatusInfo } from './helpers'
  import Row from './Row.svelte'
  import type { AscentStatus } from './types'

  interface Props {
    /** Route name. */
    name: string
    /** Display grade, e.g. "7a+". */
    grade: string
    /** Heat-scale band that colours the grade, or `undefined` for an ungraded route. */
    band: GradeBand | undefined
    /** Breadcrumb path, e.g. "Roadside · The Arch". */
    crumbs?: string | string[]
    /** Quality rating, 0–3 stars. */
    stars?: number
    /** Logged ascent state, if any. */
    status?: AscentStatus
    /** Secondary line (variant "numbered"). */
    subline?: string
    /** Render as a link. */
    href?: string
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /**
     * Render as a compact `@`-picker option (flat row, shrunk grade tile). The
     * route's own layout `variant` is independent of this picker-layout flag.
     */
    option?: boolean
    /** Keyboard-highlight state — only for the `option` layout. */
    active?: boolean
    /** `files.path` of the route's topo image — renders the real thumbnail when set. */
    topoImagePath?: string
    /** The route's line points on that topo (0–1 fractions or legacy pixels). */
    topoPoints?: TopoPoint[]
  }

  let {
    active = false,
    band,
    crumbs,
    grade,
    href,
    name,
    onclick,
    option = false,
    stars,
    status,
    subline,
    topoImagePath,
    topoPoints,
  }: Props = $props()

  const info = $derived(statusInfo(status))
  const bandColor = $derived(gradeVar(band))
  const bandFg = $derived(gradeFgVar(band))

  const hasTopo = $derived(topoImagePath != null && topoPoints != null && topoPoints.length > 0)

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
    topoPoints != null && isNormalized(topoPoints) ? buildLine(topoPoints, true, naturalWidth, naturalHeight) : null,
  )
</script>

{#snippet statusTile(tile: StatusInfo)}
  <span
    class="status-tile"
    style:background="color-mix(in oklab, {tile.color} 20%, transparent)"
    aria-label={tile.label}
  >
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={tile.filled ? tile.color : 'none'}
      stroke={tile.color}
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray={tile.dash}
    >
      <path d={tile.path} />
    </svg>
  </span>
{/snippet}

{#snippet title()}
  <span class="name-row">
    <span class="title-md ellipsis">{name}</span>
    {#if stars}<span class="stars">{starString(stars)}</span>{/if}
  </span>
{/snippet}

{#snippet rightContent()}
  {#if info}{@render statusTile(info)}{/if}
  <span class="grade-chip" style:background={bandColor} style:color={bandFg}>{grade}</span>
{/snippet}

<Row
  {active}
  {crumbs}
  {href}
  {onclick}
  {rightContent}
  {title}
  description={subline}
  variant={option ? 'option' : 'card'}
>
  <span class="thumb bg-surface-200-800">
    {#if hasTopo && topoImagePath != null}
      <!-- 52px tile at up to ~3x DPR → request a small thumbnail, not the full-res photo. -->
      <Image
        path={topoImagePath}
        alt=""
        class="h-full w-full"
        imgClass="object-cover"
        previewWidth={160}
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
        <Icon name="mountain" size={24} />
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

  .stars {
    flex: none;
    font-size: 12px;
    letter-spacing: 1px;
    color: var(--st-flash);
  }

  .grade-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    height: 25px;
    padding: 0 9px;
    border-radius: 8px;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 12.5px;
    line-height: 1;
    letter-spacing: 0.01em;
  }

  .status-tile {
    width: 30px;
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
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
