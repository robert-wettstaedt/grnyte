<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import type { NavItem } from './items'

  const {
    icon,
    size = 24,
    /**
     * Unread directed notifications. Rendered as a plain dot, never a number: the feed header's
     * bell already shows the exact count, and two counts on one screen are an invitation to
     * disagree. A dot cannot.
     *
     * The dot's whole job is "there is something for you, on a screen you are not looking at", so
     * the nav passes `0` for the tab the reader is already on: the bell that clears it is right
     * there, and a dot on the tab you are standing on points at nothing you can tap.
     */
    unread = 0,
  }: { icon: NavItem['icon']; size?: number; unread?: number } = $props()
</script>

<span class="relative flex">
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#if icon === 'explore'}
      <path d="M9 6 4 4v14l5 2 6-2 5 2V6l-5-2-6 2Z" />
      <path d="M9 6v14M15 4v14" />
    {:else if icon === 'feed'}
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    {:else}
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    {/if}
  </svg>

  {#if unread > 0}
    <span class="bg-primary-500 absolute -inset-e-0.5 -top-0.5 size-2 rounded-full" aria-hidden="true"></span>
    <span class="sr-only">{m.notifications_unread({ count: unread })}</span>
  {/if}
</span>
