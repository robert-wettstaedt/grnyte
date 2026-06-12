<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import { isNavItemActive, navItems } from './items'
  import NavIcon from './NavIcon.svelte'
</script>

<Navigation
  layout="rail"
  class="border-surface-300-700 preset-glass-neutral fixed top-0 left-0 z-30 hidden h-full w-20 border-r md:flex"
>
  <Navigation.Header class="flex justify-center">
    <a href={resolve('/(app)')} aria-label={PUBLIC_APPLICATION_NAME}>
      <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="size-10 rounded-[13px]" />
    </a>
  </Navigation.Header>

  <Navigation.Content>
    <Navigation.Menu class="flex flex-col items-center gap-2">
      {#each navItems as item (item.icon)}
        {@const active = isNavItemActive(item, page.route.id)}
        <Navigation.TriggerAnchor
          href={item.routeId}
          class={[
            'flex size-13 flex-col items-center justify-center gap-1 rounded-2xl',
            active ? 'bg-primary-500/15 text-primary-500' : 'text-surface-500 hover:bg-surface-200-800',
          ]}
          aria-current={active ? 'page' : undefined}
        >
          <NavIcon icon={item.icon} size={23} />
          <Navigation.TriggerText class="text-[10px] font-bold">
            {item.label()}
          </Navigation.TriggerText>
        </Navigation.TriggerAnchor>
      {/each}
    </Navigation.Menu>
  </Navigation.Content>
</Navigation>
