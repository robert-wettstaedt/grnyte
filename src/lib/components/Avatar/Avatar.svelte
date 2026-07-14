<script lang="ts">
  import type { Snippet } from 'svelte'

  // Round initials avatar. Solid fill marks a registered user, tinted a plain name.
  interface Props {
    /** Display name — initials come from the first two words. */
    name?: string
    /** Solid fill (registered user) vs tinted. */
    solid?: boolean
    /** Diameter in px. */
    size?: number
    /** Show a pulsing placeholder instead of initials while the name is still loading. */
    loading?: boolean
    /** Replaces the derived initials (e.g. a "Me" label or an icon). */
    children?: Snippet
  }

  let { name = '', solid = false, size = 30, loading = false, children }: Props = $props()

  const initials = $derived.by(() => {
    const parts = name.trim().split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
  })
</script>

{#if loading}
  <span
    class="bg-surface-200-800 flex flex-none animate-pulse rounded-full"
    style:width="{size}px"
    style:height="{size}px"
  ></span>
{:else}
  <span
    class={[
      'flex flex-none items-center justify-center rounded-full font-bold',
      solid ? 'bg-primary-500 text-primary-contrast-500' : 'bg-primary-500/20 text-primary-400',
    ]}
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{Math.round(size * 0.37)}px"
  >
    {#if children}{@render children()}{:else}{initials}{/if}
  </span>
{/if}
