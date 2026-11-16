<script lang="ts" module>
  /** A row's text action: "Change", "Add", "Remove", "Sign out". */
  export const rowAction =
    'text-primary-600-400 disabled:text-surface-500 flex-none px-0.5 py-2 text-sm font-bold disabled:font-semibold disabled:opacity-100'
</script>

<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import type { Snippet } from 'svelte'

  // One row of the sign-in methods screen: icon tile, name over a status line, a text action.
  interface Props {
    action?: Snippet
    /** Under the row: a reason line or an inline step. */
    children?: Snippet
    icon?: IconName
    /** The status line in green: "Set", "Connected", "This device". */
    on?: boolean
    status: string
    /** A brand mark in place of `icon`. */
    tile?: Snippet
    title: string
  }

  const { action, children, icon, on = false, status, tile, title }: Props = $props()
</script>

<div>
  <div class="flex min-h-11 items-center gap-3 px-4 py-3.5">
    <span
      class="bg-surface-100-900 flex size-9 flex-none items-center justify-center rounded-[10px]"
      aria-hidden="true"
    >
      {#if tile != null}
        {@render tile()}
      {:else if icon != null}
        <Icon name={icon} size={18} />
      {/if}
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="text-[15px] font-semibold">{title}</span>
      <span class={['text-[12.5px]', on ? 'text-success-600-400 font-semibold' : 'text-surface-600-400']}>
        {status}
      </span>
    </span>
    {@render action?.()}
  </div>
  {@render children?.()}
</div>
