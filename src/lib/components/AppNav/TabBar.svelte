<script lang="ts">
  import { page } from '$app/state'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import { isNavItemActive, navItems } from './items'
  import NavIcon from './NavIcon.svelte'
</script>

<Navigation
  layout="bar"
  class="border-surface-300-700 preset-glass-neutral fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
>
  <Navigation.Menu class="grid grid-cols-3 justify-center gap-2">
    {#each navItems as item (item.icon)}
      {@const active = isNavItemActive(item, page.route.id)}
      <Navigation.TriggerAnchor
        href={item.routeId}
        class={[
          'flex flex-col items-center justify-center gap-1 rounded-2xl',
          active ? 'bg-primary-500/15 text-primary-500' : 'text-surface-500 hover:bg-surface-200-800',
        ]}
        aria-current={active ? 'page' : undefined}
      >
        <NavIcon icon={item.icon} size={24} />
        <Navigation.TriggerText class="text-[11px] font-semibold">
          {item.label()}
        </Navigation.TriggerText>
      </Navigation.TriggerAnchor>
    {/each}
  </Navigation.Menu>
</Navigation>
