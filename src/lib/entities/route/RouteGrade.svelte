<script lang="ts">
  import { gradeFgVar, gradeVar, type GradeBand } from '$lib/entities/grade/color'

  interface Props {
    /** Heat-scale band that colours the chip, or `undefined` for an ungraded route. */
    band: GradeBand | undefined
    /** Display grade in the user's scale, e.g. "7a+". */
    grade: string
    /** Outlined in the band's colour instead of filled, for a route outside the active filter. */
    muted?: boolean
  }

  const { band, grade, muted = false }: Props = $props()
</script>

<!-- Counterpart of AscentType's seam rule: flatten the start corners when the
     chip directly follows an `.route-tag` tile, fusing the two into one chip. -->
<span
  class="route-tag inline-flex h-6.25 flex-none items-center justify-center rounded-lg px-2.25 font-mono text-[12.5px]/none font-bold tracking-[0.01em] [.route-tag+&]:rounded-s-none"
  style:background={muted ? 'transparent' : gradeVar(band)}
  style:box-shadow={muted ? `inset 0 0 0 1.5px ${gradeVar(band)}` : undefined}
  style:color={muted ? undefined : gradeFgVar(band)}
>
  {grade}
</span>
