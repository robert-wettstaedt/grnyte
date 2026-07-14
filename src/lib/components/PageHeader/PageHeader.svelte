<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'

  // Sticky page chrome for full-page detail/list routes: back button plus a title
  // row, with an optional second row (e.g. filter chips) underneath.
  interface Props {
    /** Back-button handler; callers wire it to `back(fallbackHref)`. */
    onback: () => void
    /** Content beside the back button (title block, trailing actions). */
    children: Snippet
    /** Optional second row under the title row. */
    bottom?: Snippet
  }

  const { onback, children, bottom }: Props = $props()
</script>

<header
  class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex flex-col gap-2.5 border-b px-3 py-3 backdrop-blur"
>
  <div class="flex items-center gap-3">
    <button
      class="btn-icon preset-filled-surface-200-800 flex-none"
      onclick={onback}
      type="button"
      aria-label={m.common_back()}
    >
      <Icon name="arrow-left" size={18} />
    </button>
    {@render children()}
  </div>
  {#if bottom}
    {@render bottom()}
  {/if}
</header>
