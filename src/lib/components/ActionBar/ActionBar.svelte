<script lang="ts" module>
  export const ACTION_CTA = 'btn btn-lg min-w-0 flex-1 text-base'
  export const ACTION_TOOL = 'btn preset-tonal btn-lg size-12 shrink-0 px-0'
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
