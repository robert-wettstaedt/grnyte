<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import UpdateBadge from '$lib/components/UpdateBadge/UpdateBadge.svelte'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { applyUpdateOnClick } from '$lib/state/updateReady.svelte'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import { isNavItemActive, navItems } from './items'
  import NavIcon from './NavIcon.svelte'

  const global = getGlobalState()
</script>

<Navigation
  layout="rail"
  class="border-surface-300-700 preset-glass-neutral fixed top-0 left-0 z-30 hidden h-full w-20 border-r md:flex"
>
  <Navigation.Header class="flex justify-center">
    <!-- No `aria-label`: it would replace the subtree, so `UpdateBadge`'s announcement would never
         be read here while the mobile logo reads it. The image's `alt` names the link either way. -->
    <a href={resolve('/(app)')} class="relative" onclick={applyUpdateOnClick}>
      <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="size-10" />
      <UpdateBadge />
    </a>
  </Navigation.Header>

  <Navigation.Content>
    <Navigation.Menu class="flex flex-col items-center gap-2">
      {#each navItems as item (item.icon)}
        {@const active = isNavItemActive(item, page.route.id)}
        <Navigation.TriggerAnchor
          href={item.routeId}
          class={[
            'flex h-13 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1',
            active ? 'bg-primary-500/15 text-primary-500' : 'text-surface-500 hover:bg-surface-200-800',
          ]}
          aria-current={active ? 'page' : undefined}
        >
          <NavIcon
            icon={item.icon}
            size={23}
            unread={item.icon === 'feed' && !active ? global.unreadNotifications : 0}
          />
          <Navigation.TriggerText class="w-full truncate text-center text-[10px] font-bold">
            {item.label()}
          </Navigation.TriggerText>
        </Navigation.TriggerAnchor>
      {/each}
    </Navigation.Menu>
  </Navigation.Content>
</Navigation>
