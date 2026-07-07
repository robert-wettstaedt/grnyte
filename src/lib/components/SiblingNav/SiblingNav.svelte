<!-- Prev/next nav controls: two chevron links around a position/total counter. Presentational
     only — the caller owns the nav data (SheetNav) and the surrounding flex chrome (the sheet's
     mobile pill / desktop footer, the route detail page's sticky footer). On the desktop/keyboard
     surfaces the chevrons carry hover tooltips with the j/l keybind hints. -->
<script lang="ts">
  import type { IconName } from '$lib/components/Icon/icons'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { Tooltip } from '@skeletonlabs/skeleton-svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { MediaQuery } from 'svelte/reactivity'
  import type { SheetNav } from './siblingNav'

  interface Props {
    nav: SheetNav
    /** Larger touch targets, for the mobile sheet pill. */
    large?: boolean
  }

  const { nav, large = false }: Props = $props()

  // The chevrons carry hover tooltips advertising the j/l keybinds, so only show
  // them where the device can actually hover (and, by implication, has a keyboard).
  // On touch they'd be dead chrome — a tap that focuses a chevron could even flash
  // an irrelevant hint — so the plain links render instead.
  const canHover = new MediaQuery('(hover: hover)')

  const linkClass = $derived(['btn-icon preset-filled-surface-200-800', large && 'btn-icon-lg'])
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- nav hrefs are pre-resolved by the caller (toSheetNav). -->
{#snippet chevron(icon: IconName, href: string, label: string, key: string)}
  {#if canHover.current}
    <Tooltip openDelay={300}>
      <Tooltip.Trigger>
        {#snippet element(attributes)}
          <a
            {...attributes as unknown as HTMLAttributes<HTMLAnchorElement>}
            class={linkClass}
            {href}
            aria-label={label}
          >
            <Icon name={icon} size={18} />
          </a>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content
          class="card preset-filled-surface-950-50 z-50 flex items-center gap-1.5 px-2 py-1 text-xs shadow-lg"
        >
          {label}
          <kbd class="kbd text-surface-950-50!">{key}</kbd>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip>
  {:else}
    <a class={linkClass} {href} aria-label={label} title={label}>
      <Icon name={icon} size={18} />
    </a>
  {/if}
{/snippet}

{@render chevron('chevron-left', nav.prev.href, nav.prev.label, 'J')}
<span class="min-w-8 px-1 text-center text-sm font-bold tabular-nums">{nav.position}/{nav.total}</span>
{@render chevron('chevron-right', nav.next.href, nav.next.label, 'L')}
