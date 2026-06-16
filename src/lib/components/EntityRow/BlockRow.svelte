<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Row from './Row.svelte'

  interface Props {
    /** Block name. */
    name: string
    /** Eyebrow line — typically the geographic region. */
    region?: string
    /** Breadcrumb path of parent areas. */
    crumbs?: string | string[]
    /** Secondary line, e.g. "12 routes · 6 m". */
    subline?: string
    /** Badge over the topo thumbnail, e.g. a route count. */
    badge?: string
    /** Render as a link. */
    href?: string
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /** `card` (listing) or `option` (compact `@`-picker row). */
    variant?: 'card' | 'option'
    /** Keyboard-highlight state — only for the `option` variant. */
    active?: boolean
  }

  let { name, region, crumbs, subline, badge, href, onclick, variant = 'card', active = false }: Props = $props()

  const thumbSize = $derived(variant === 'option' ? 40 : 56)

  // Decorative default topo geometry for the thumbnail.
  const TOPO = {
    fill: 'M0 56 L0 30 C 14 22 22 30 32 23 C 41 17 49 25 56 20 L56 56 Z',
    line1: 'M16 52 C 13 36 22 28 19 14',
    line2: 'M34 52 C 38 36 29 26 34 12',
  }
</script>

<Row title={name} {region} {crumbs} description={subline} {href} {onclick} {variant} {active}>
  <span class="thumb" style:width="{thumbSize}px" style:height="{thumbSize}px">
    <svg viewBox="0 0 56 56" width={thumbSize} height={thumbSize} class="block">
      <path d={TOPO.fill} fill="oklch(0 0 0 / 0.24)" />
      <path d={TOPO.line1} fill="none" stroke="var(--grade-4)" stroke-width="2.1" stroke-linecap="round" />
      <path d={TOPO.line2} fill="none" stroke="var(--grade-2)" stroke-width="2.1" stroke-linecap="round" />
    </svg>
    {#if badge}<span class="badge">{badge}</span>{/if}
  </span>

  {#snippet rightContent()}
    {#if variant !== 'option'}
      <Icon name="chevron-right" size={18} strokeWidth={2.2} class="text-surface-500 shrink-0" />
    {/if}
  {/snippet}
</Row>

<style>
  .thumb {
    width: 56px;
    height: 56px;
    flex: none;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    background: linear-gradient(160deg, var(--map-terrain), var(--color-surface-700));
  }

  .thumb .block {
    display: block;
  }

  .badge {
    position: absolute;
    right: 4px;
    bottom: 4px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 5px;
    border-radius: 999px;
    background: oklch(0 0 0 / 0.5);
    font-size: 9.5px;
    font-weight: 700;
    color: #fff;
  }
</style>
