<script lang="ts" module>
  export const ACTION_CTA = 'btn btn-lg min-w-0 flex-1 text-base'
  // Icon over a short label. A bare icon square is not self-explanatory, and a hover tooltip
  // cannot help on touch, which is where these bars mostly live.
  export const ACTION_TOOL =
    'btn preset-tonal h-12 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 px-1.5'
  // 10px matches the count badge beside the icon, and is the size the rest of the app uses for
  // small labels.
  export const ACTION_TOOL_LABEL = 'text-[10px] leading-none font-semibold'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  /** One labelled action at most: two never fit the 343px mobile sheet in German. */
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

  <!-- gap-1.5, not gap-2: the 6px is what keeps a CTA off its min-content width at 360px. -->
  <div class="ml-auto flex gap-1.5">
    {@render children()}
  </div>
</div>
