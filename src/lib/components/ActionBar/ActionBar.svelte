<script lang="ts" module>
  export const ACTION_CTA = 'btn btn-lg min-w-0 flex-1 text-base'
  // Icon over a short label. A bare icon square is not self-explanatory, and a hover tooltip
  // cannot help on touch, which is where these bars mostly live.
  export const ACTION_TOOL =
    'btn preset-tonal h-12 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 px-1.5'
  // A step below the 11px the count badge beside it uses: every tool carries a label now, and they
  // have to fit alongside a CTA that must not truncate.
  export const ACTION_TOOL_LABEL = 'text-[10px] leading-none font-semibold'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  /** One CTA at most. Every tool carries a label too, so the row has no slack left. */
  interface Props {
    /** The tool squares, in a fixed order across screens. */
    children: Snippet
    /** The one labelled action, on the screens that have one. */
    cta?: Snippet
  }

  const { children, cta }: Props = $props()
</script>

<div class="flex gap-2">
  {@render cta?.()}

  <!-- gap-1.5, not gap-2: the labels left the CTA little room, and this is part of what it keeps. -->
  <div class="ml-auto flex gap-1.5">
    {@render children()}
  </div>
</div>
