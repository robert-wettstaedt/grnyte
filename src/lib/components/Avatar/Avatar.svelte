<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { Author } from '$lib/entities/displayName'
  import type { Snippet } from 'svelte'

  // Round initials avatar. Solid fill marks a registered user, tinted a plain name.
  interface Props {
    /** A person who made something: a neutral face once deleted, a placeholder while syncing. */
    author?: Author
    /** Replaces the derived initials (e.g. a "Me" label or an icon). */
    children?: Snippet
    /** Show a pulsing placeholder instead of initials while the name is still loading. */
    loading?: boolean
    /** Display name, when there is no `author`. Initials come from the first two words. */
    name?: string
    /** Diameter in px. */
    size?: number
    /** Solid fill (registered user) vs tinted. */
    solid?: boolean
  }

  let {
    author,
    children,
    loading: nameLoading = false,
    name: plainName = '',
    size = 30,
    solid = false,
  }: Props = $props()

  const deleted = $derived(author?.id === null)
  const name = $derived(author?.name ?? plainName)
  const loading = $derived(nameLoading || author?.name === '')

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
{:else if deleted}
  <span
    class="bg-surface-300-700 text-surface-600-400 flex flex-none items-center justify-center rounded-full"
    style:width="{size}px"
    style:height="{size}px"
  >
    <Icon name="user" size={Math.round(size * 0.55)} />
  </span>
{:else}
  <span
    class={[
      'flex flex-none items-center justify-center rounded-full font-bold',
      solid ? 'bg-primary-500 text-primary-contrast-500' : 'bg-primary-500/20 text-primary-700-300',
    ]}
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{Math.round(size * 0.37)}px"
  >
    {#if children}{@render children()}{:else}{initials}{/if}
  </span>
{/if}
