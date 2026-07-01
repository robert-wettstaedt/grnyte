<script lang="ts">
  import { gradeFgVar, gradeVar, type GradeBand } from '$lib/entities/grade/color'
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
  }: Props = $props()

  const info = $derived(statusInfo(status))
  const bandColor = $derived(gradeVar(band))
  const bandFg = $derived(gradeFgVar(band))

  // Decorative default topo geometry for the "photo" thumbnail.
  const TOPO = {
    fill: 'M0 58 L0 31 C 14 23 24 31 34 24 C 44 18 52 26 58 21 L58 58 Z',
    faint1: 'M15 54 C 13 40 20 32 17 18',
    faint2: 'M45 54 C 47 40 38 30 43 16',
    line: 'M29 52 C 26 38 35 30 30 13',
  }
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
  <span class="thumb">
    <svg viewBox="0 0 58 58" width="52" height="52" class="block">
      <path d={TOPO.fill} fill="oklch(0 0 0 / 0.30)" />
      <path d={TOPO.faint1} fill="none" stroke="oklch(1 0 0 / 0.16)" stroke-width="1.5" stroke-linecap="round" />
      <path d={TOPO.faint2} fill="none" stroke="oklch(1 0 0 / 0.16)" stroke-width="1.5" stroke-linecap="round" />
      <path
        d={TOPO.line}
        fill="none"
        stroke={bandColor}
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
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
    background: linear-gradient(165deg, oklch(0.34 0.02 220), oklch(0.2 0.015 60));
  }

  .thumb .block {
    display: block;
  }
</style>
