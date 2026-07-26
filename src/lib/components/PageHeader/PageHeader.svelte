<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'

  // Sticky page chrome for full-page detail/list routes: back button plus a title
  // row, with an optional second row (e.g. filter chips) underneath.
  interface Props {
    /** Optional second row under the title row. */
    bottom?: Snippet
    /** Content beside the back button, for stacked blocks like breadcrumb + name. Pass `title`
     *  instead for a plain page title. */
    children?: Snippet
    /** Back-button handler; callers wire it to `back(fallbackHref)`. */
    onback: () => void
    /** Plain page title. Centred and small, matching the header in forms/Form.svelte - change
     *  the two together. */
    title?: string
  }

  const { bottom, children, onback, title }: Props = $props()
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
    {#if title != null}
      <h1 class="min-w-0 flex-1 truncate text-center text-sm font-bold">{title}</h1>
      <!-- Mirrors the back button so a centred title sits on the true centre of the bar. -->
      <div class="size-8 flex-none" aria-hidden="true"></div>
    {:else}
      {@render children?.()}
    {/if}
  </div>
  {#if bottom}
    {@render bottom()}
  {/if}
</header>
