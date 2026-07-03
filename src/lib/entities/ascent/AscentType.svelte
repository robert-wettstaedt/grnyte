<script module lang="ts">
  import type { AscentType } from './dto'

  interface StatusInfo {
    /** Accessible label, e.g. "Flashed". */
    label: string
    /** Accent colour (a `--st-*` token). */
    color: string
    /** SVG path for the status glyph (24×24 viewBox). */
    path: string
    /** Whether the glyph is filled (vs a stroked outline). */
    filled: boolean
    /** Optional dash pattern (e.g. the dotted "attempt" ring). */
    dash: string
  }

  const STATUS: Record<AscentType, StatusInfo> = {
    flash: {
      label: 'Flashed',
      color: 'var(--st-flash)',
      path: 'M11 2 4 13h5l-1 9 8-12h-6l1-8Z',
      filled: true,
      dash: '',
    },
    send: { label: 'Sent', color: 'var(--st-sent)', path: 'M4 12.5l4.5 4.5L20 6', filled: false, dash: '' },
    attempt: {
      label: 'Tried',
      color: 'var(--st-proj)',
      path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
      filled: false,
      dash: '3 3.2',
    },
    repeat: {
      label: 'Repeat',
      color: 'var(--st-repeat)',
      path: 'M20 8a8.5 8.5 0 0 0-15-2.3M4 16a8.5 8.5 0 0 0 15 2.3M5 4.2v3.5h3.5M19 19.8v-3.5h-3.5',
      filled: false,
      dash: '',
    },
  }
</script>

<script lang="ts">
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
    aria-label={info.label}
  >
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={info.filled ? info.color : 'none'}
      stroke={info.color}
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray={info.dash}
    >
      <path d={info.path} />
    </svg>
  </span>
{/if}
