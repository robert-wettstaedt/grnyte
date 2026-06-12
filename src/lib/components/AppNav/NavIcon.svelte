<script lang="ts">
  import type { NavItem } from './items'

  const { icon, size = 24 }: { icon: NavItem['icon']; size?: number } = $props()
</script>

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
