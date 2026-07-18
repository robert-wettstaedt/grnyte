<!-- Prev/next nav controls: two chevron links around a position/total counter. Presentational
     only — the caller owns the nav data (SheetNav) and the surrounding flex chrome (the sheet's
     mobile pill / desktop footer, the route detail page's sticky footer). On the desktop/keyboard
     surfaces the chevrons carry hover tooltips with the j/l keybind hints. -->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import KbdTooltip from '$lib/components/KbdTooltip/KbdTooltip.svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import type { SheetNav } from './siblingNav'

  interface Props {
    /** Larger touch targets, for the mobile sheet pill. */
    large?: boolean
    nav: SheetNav
  }

  const { large = false, nav }: Props = $props()

  const linkClass = $derived(['btn-icon preset-filled-surface-200-800', large && 'btn-icon-lg'])
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- nav hrefs are pre-resolved by the caller (toSheetNav). -->
{#snippet chevron(icon: IconName, href: string, label: string, key: string)}
  <KbdTooltip {label} {key}>
    {#snippet trigger(attributes)}
      <a {...attributes as unknown as HTMLAttributes<HTMLAnchorElement>} class={linkClass} {href} aria-label={label}>
        <Icon name={icon} size={18} />
      </a>
    {/snippet}
  </KbdTooltip>
{/snippet}

{@render chevron('chevron-left', nav.prev.href, nav.prev.label, 'J')}
<span class="min-w-8 px-1 text-center text-sm font-bold tabular-nums">{nav.position}/{nav.total}</span>
{@render chevron('chevron-right', nav.next.href, nav.next.label, 'L')}
