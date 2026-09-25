<script lang="ts" module>
  export const ACTION_CTA = 'btn btn-lg min-w-0 flex-1 text-base'
  // Icon over a short label. A bare icon square is not self-explanatory, and a hover tooltip
  // cannot help on touch, which is where these bars mostly live.
  export const ACTION_TOOL =
    'btn preset-tonal h-12 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 px-1.5'
  // A step below the 11px of the count badge beside it. A tight screen carries six squares, so the
  // label must stay inside the 48px square.
  export const ACTION_TOOL_LABEL = 'text-[10px] leading-none font-semibold'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Every tool carries a label, so a six-square row has little room at the narrowest phone width.
   *  A screen that needs six renders its primary action as a square tool, not as `cta`. */
  interface Props {
    /** The tool squares, in a fixed order across screens. */
    children: Snippet
    /** The one labelled action, on the screens that have room for one. */
    cta?: Snippet
  }

  const { children, cta }: Props = $props()
</script>

<div class="flex gap-2">
  {@render cta?.()}

  <!-- gap-1, not gap-1.5: the row cannot wrap, so at the narrowest phone width a six-square row
       needs every pixel, and the failure is a control off screen rather than a tight-looking row. -->
  <div class="ml-auto flex gap-1">
    {@render children()}
  </div>
</div>
