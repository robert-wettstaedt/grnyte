<script lang="ts">
  import type { StatusInfo } from './AscentType.svelte'

  // The bare status glyph, shared by the AscentType badge and the form's type picker
  // so the two can never drift.
  interface Props {
    info: StatusInfo
    size?: number
  }

  const { info, size = 15 }: Props = $props()
</script>

<svg
  width={size}
  height={size}
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
