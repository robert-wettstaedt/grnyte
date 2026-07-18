<script lang="ts">
  import { gradeFgVar, gradeVar, type GradeBand } from '$lib/entities/grade/color'

  interface Props {
    /** Heat-scale band that colours the chip, or `undefined` for an ungraded route. */
    band: GradeBand | undefined
    /** Display grade in the user's scale, e.g. "7a+". */
    grade: string
  }

  const { band, grade }: Props = $props()
</script>

<!-- Counterpart of AscentType's seam rule: flatten the start corners when the
     chip directly follows an `.route-tag` tile, fusing the two into one chip. -->
<span
  class="route-tag inline-flex h-6.25 flex-none items-center justify-center rounded-lg px-2.25 font-mono text-[12.5px]/none font-bold tracking-[0.01em] [.route-tag+&]:rounded-s-none"
  style:background={gradeVar(band)}
  style:color={gradeFgVar(band)}
>
  {grade}
</span>
