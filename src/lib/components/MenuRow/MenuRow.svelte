<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'

  interface BaseProps {
    /** Accent (primary) icon tile — for "add" actions. */
    accent?: boolean
    /** Optional second line under the label. */
    description?: string
    /** Destructive (error) styling — for delete. */
    destructive?: boolean
    /** Button rows only. For a destructive row whose consequence is not known yet (e.g. still
     *  counting what it would delete), so the wait is a non-destructive state rather than a
     *  deletion of an unknown quantity. */
    disabled?: boolean
    href?: string
    label: string
    onclick?: () => void
    /** The current choice in a menu of options: an accent tile (or a ring on an avatar) plus a
     *  trailing check, so it does not read as selected by colour alone. Announced as
     *  `aria-pressed` on a button row and `aria-current` on a link one, so the check is never
     *  visual-only. */
    selected?: boolean
  }

  /**
   * Every row carries a leading visual, and it is one of the two: an icon tile, or a person's
   * avatar rendered in the same 40px slot so a row about somebody lines up with the icon rows
   * around it. A union rather than two optionals, so a row with neither is a type error rather
   * than a headless row that misaligns against its siblings at runtime.
   */
  type Props = BaseProps & ({ avatar: string; icon?: never } | { avatar?: never; icon: IconName })

  const {
    accent = false,
    avatar,
    description,
    destructive = false,
    disabled = false,
    href,
    icon,
    label,
    onclick,
    selected = false,
  }: Props = $props()
</script>

{#snippet body()}
  {#if avatar != null}
    <!-- A ring, not `solid`: on Avatar that fill means "registered user", and every person in a
         menu is one. Reusing it for selection would read as one real account among unregistered
         names. -->
    <span class={['flex flex-none rounded-full', selected && 'ring-primary-500 ring-2']}>
      <Avatar name={avatar} size={40} />
    </span>
  {:else if icon != null}
    <span
      class={[
        'flex size-10 flex-none items-center justify-center rounded-xl',
        destructive
          ? 'bg-error-500/15 text-error-500'
          : accent || selected
            ? 'bg-primary-500/15 text-primary-500'
            : 'bg-surface-200-800 text-surface-600-400',
      ]}
    >
      <Icon name={icon} size={20} />
    </span>
  {/if}
  <span class="flex min-w-0 flex-col">
    <span class="font-medium">{label}</span>
    {#if description}
      <span class="text-surface-600-400 text-xs font-normal">{description}</span>
    {/if}
  </span>

  {#if selected}
    <Icon name="check" class="text-primary-500 ms-auto flex-none" size={18} />
  {/if}
{/snippet}

{#if href != null}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass a resolve()'d href -->
  <a
    aria-current={selected ? true : undefined}
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
    aria-pressed={selected ? true : undefined}
    class={[
      'hover:bg-surface-200-800 flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors',
      destructive && 'text-error-500',
      disabled && 'pointer-events-none opacity-50',
    ]}
    {disabled}
    {onclick}
  >
    {@render body()}
  </button>
{/if}
