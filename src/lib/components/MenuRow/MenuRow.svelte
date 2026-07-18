<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'

  interface Props {
    /** Accent (primary) icon tile — for "add" actions. */
    accent?: boolean
    /** Optional second line under the label. */
    description?: string
    /** Destructive (error) styling — for delete. */
    destructive?: boolean
    href?: string
    icon: IconName
    label: string
    onclick?: () => void
  }

  const { accent = false, description, destructive = false, href, icon, label, onclick }: Props = $props()
</script>

{#snippet body()}
  <span
    class={[
      'flex size-10 flex-none items-center justify-center rounded-xl',
      destructive
        ? 'bg-error-500/15 text-error-500'
        : accent
          ? 'bg-primary-500/15 text-primary-500'
          : 'bg-surface-200-800 text-surface-600-400',
    ]}
  >
    <Icon name={icon} size={20} />
  </span>
  <span class="flex min-w-0 flex-col">
    <span class="font-medium">{label}</span>
    {#if description}
      <span class="text-surface-600-400 text-xs font-normal">{description}</span>
    {/if}
  </span>
{/snippet}

{#if href != null}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass a resolve()'d href -->
  <a
    class={[
      'hover:bg-surface-200-800 flex items-center gap-3 rounded-lg px-1 py-2 transition-colors',
      destructive && 'text-error-500',
    ]}
    {href}
    {onclick}
  >
    {@render body()}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
  <button
    type="button"
    class={[
      'hover:bg-surface-200-800 flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors',
      destructive && 'text-error-500',
    ]}
    {onclick}
  >
    {@render body()}
  </button>
{/if}
