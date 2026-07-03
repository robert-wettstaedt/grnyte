<!-- Shared desktop footer nav: prev/next links with Tooltip + kbd hints for the j/l shortcuts.
     Renders nothing while no page has set sheetState.nav. -->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { Tooltip } from '@skeletonlabs/skeleton-svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { sheetState } from './sheetState.svelte'
</script>

{#if sheetState.nav}
  {@const nav = sheetState.nav}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- nav hrefs are pre-resolved in the page (toSheetNav). -->
  <footer class="border-surface-100-900 flex shrink-0 items-center justify-center gap-1.5 border-t-2 px-4 py-3">
    <Tooltip openDelay={300}>
      <Tooltip.Trigger>
        {#snippet element(attributes)}
          <a
            {...attributes as unknown as HTMLAttributes<HTMLAnchorElement>}
            class="btn-icon preset-filled-surface-200-800"
            href={nav.prev.href}
            aria-label={nav.prev.label}
          >
            <Icon name="chevron-left" size={18} />
          </a>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content
          class="card preset-filled-surface-950-50 z-50 flex items-center gap-1.5 px-2 py-1 text-xs shadow-lg"
        >
          {nav.prev.label}
          <kbd class="kbd text-surface-950-50!">J</kbd>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip>

    <span class="min-w-8 px-1 text-center text-sm font-bold tabular-nums">{nav.position}/{nav.total}</span>

    <Tooltip openDelay={300}>
      <Tooltip.Trigger>
        {#snippet element(attributes)}
          <a
            {...attributes as unknown as HTMLAttributes<HTMLAnchorElement>}
            class="btn-icon preset-filled-surface-200-800"
            href={nav.next.href}
            aria-label={nav.next.label}
          >
            <Icon name="chevron-right" size={18} />
          </a>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content
          class="card preset-filled-surface-950-50 z-50 flex items-center gap-1.5 px-2 py-1 text-xs shadow-lg"
        >
          {nav.next.label}
          <kbd class="kbd text-surface-950-50!">L</kbd>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip>
  </footer>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
