<script module lang="ts">
  import { m } from '$lib/paraglide/messages'
  import type { AscentType } from './dto'

  export interface StatusInfo {
    /** Accent colour (a `--st-*` token). */
    color: string
    /** Optional dash pattern (e.g. the dotted "attempt" ring). */
    dash: string
    /** Whether the glyph is filled (vs a stroked outline). */
    filled: boolean
    /**
     * Accessible label, e.g. "Flashed". A function for the same reason as `ASCENT_TYPES`
     * below: this module evaluates before the locale settles.
     */
    label: () => string
    /** SVG path for the status glyph (24×24 viewBox). */
    path: string
  }

  /** Also drives the ascent form's type picker, so the glyphs stay in sync. */
  export const STATUS: Record<AscentType, StatusInfo> = {
    attempt: {
      color: 'var(--st-proj)',
      dash: '3 3.2',
      filled: false,
      label: m.ascents_statusTried,
      path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
    },
    flash: {
      color: 'var(--st-flash)',
      dash: '',
      filled: true,
      label: m.ascents_statusFlashed,
      path: 'M11 2 4 13h5l-1 9 8-12h-6l1-8Z',
    },
    redpoint: {
      color: 'var(--st-redpoint)',
      dash: '',
      filled: false,
      label: m.ascents_statusRedpointed,
      path: 'M4 12.5l4.5 4.5L20 6',
    },
    repeat: {
      color: 'var(--st-repeat)',
      dash: '',
      filled: false,
      label: m.ascents_statusRepeated,
      path: 'M20 8a8.5 8.5 0 0 0-15-2.3M4 16a8.5 8.5 0 0 0 15 2.3M5 4.2v3.5h3.5M19 19.8v-3.5h-3.5',
    },
  }

  /**
   * The four types in display order with their translated form labels (as functions:
   * this module evaluates before the locale settles). Drives the form's type picker
   * and the ascent list's filter chips.
   */
  export const ASCENT_TYPES: { label: () => string; type: AscentType }[] = [
    { label: m.ascents_form_typeFlash, type: 'flash' },
    { label: m.ascents_form_typeRedpoint, type: 'redpoint' },
    { label: m.ascents_form_typeAttempt, type: 'attempt' },
    { label: m.ascents_form_typeRepeat, type: 'repeat' },
  ]
</script>

<script lang="ts">
  import AscentTypeGlyph from './AscentTypeGlyph.svelte'

  interface Props {
    /** The user's logged ascent state; renders nothing when `undefined`. */
    status: AscentType | undefined
  }

  const { status }: Props = $props()

  const info = $derived(status == null ? null : STATUS[status])
</script>

{#if info != null}
  <!-- `.route-tag` pair up: when a RouteGrade directly follows,
       the corners at the seam flatten so the two read as one segmented chip. -->
  <span
    class="route-tag flex size-6.25 flex-none items-center justify-center rounded-lg has-[+.route-tag]:rounded-e-none"
    style:background="color-mix(in oklab, {info.color} 20%, transparent)"
    aria-label={info.label()}
  >
    <AscentTypeGlyph {info} />
  </span>
{/if}
