<script lang="ts" module>
  /** Width of the page chrome's inner row. Exported so a sticky footer on the same screen lines
   *  up with the header above it. */
  export const PAGE_CHROME_WIDTH = 'max-w-3xl'
</script>

<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'

  // The app's one sticky page bar: leading back/cancel chip, centred title, optional trailing
  // action, with an optional second row (e.g. filter chips) underneath.
  //
  // The two shapes it covers are a navigation bar (back chip alone: you are leaving a place, and
  // nothing is at stake) and a task bar (`action` set: you commit or abandon, and abandoning
  // discards what was typed). That is why a task bar also takes `backLabel` - an icon-only arrow
  // does not warn anybody that leaving throws their input away.
  interface Props {
    /** Trailing action (submit, done). Its presence makes this a task bar rather than a nav bar.
     *  Render `PageHeaderAction` inside it so every task bar gets the same button. */
    action?: Snippet
    /** Label beside the back icon, from `sm` up. Set it whenever leaving discards something. */
    backLabel?: string
    /** Optional second row under the title row. */
    bottom?: Snippet
    /** Content beside the back button, for stacked blocks like breadcrumb + name. Pass `title`
     *  instead for a plain page title. */
    children?: Snippet
    /** Back-button handler; callers wire it to `back(fallbackHref)`. */
    onback: () => void
    /** Plain page title. */
    title?: string
  }

  const { action, backLabel, bottom, children, onback, title }: Props = $props()
</script>

<!-- The bar is full bleed (its hairline and blur span the viewport, which is what makes it read as
     chrome) but its contents are capped: pinned to the edges of a wide screen the buttons end up
     far outside the content below them. Capped at the widest content column any screen uses, so
     the chrome frames the content rather than sitting inside it. -->
<header
  class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex flex-col gap-2.5 border-b px-3 py-3 backdrop-blur"
>
  <div class="mx-auto flex w-full items-center gap-3 {PAGE_CHROME_WIDTH}">
    <!-- Icon-only below sm, icon plus label from sm up: German labels ("Abbrechen") ate so much of
         a phone-width bar that the title truncated. -->
    <button
      class={['btn preset-filled-surface-200-800 size-8 flex-none px-0', backLabel != null && 'sm:size-auto sm:px-4']}
      onclick={onback}
      type="button"
      aria-label={backLabel ?? m.common_back()}
    >
      <Icon name="arrow-left" size={18} />
      {#if backLabel != null}
        <span class="hidden sm:inline">{backLabel}</span>
      {/if}
    </button>

    {#if title != null}
      <!-- In flow rather than absolutely centred, so a long title truncates instead of running
           under the buttons. -->
      <h1 class="min-w-0 flex-1 truncate text-center text-sm font-bold">{title}</h1>
    {:else}
      {@render children?.()}
    {/if}

    {#if action}
      {@render action()}
    {:else if title != null}
      <!-- Mirrors the back button so a centred title sits on the true centre of the bar. -->
      <div class="size-8 flex-none" aria-hidden="true"></div>
    {/if}
  </div>

  {#if bottom}
    <div class="mx-auto w-full {PAGE_CHROME_WIDTH}">
      {@render bottom()}
    </div>
  {/if}
</header>
