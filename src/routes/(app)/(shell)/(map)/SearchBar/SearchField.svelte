<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'

  interface Props {
    /** Bindable text value. */
    value: string
    placeholder: string
    /** Cleared via the trailing × button (shown only while `value` is non-empty). */
    onClear: () => void
    /** Native input event (keyup), e.g. submit-on-Enter for navigation search. */
    onkeyup?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void
    /** Replaces the decorative leading search icon (e.g. a submit button). */
    leading?: Snippet
    /** Trailing content inside the bar (e.g. the Filter pill). */
    trailing?: Snippet
  }

  let { value = $bindable(), placeholder, onClear, onkeyup, leading, trailing }: Props = $props()
</script>

<div
  class="bg-surface-100-900 border-surface-200-800 flex h-12 w-full min-w-0 items-center gap-2 rounded-xl border pr-2 pl-3"
>
  {#if leading}
    {@render leading()}
  {:else}
    <Icon name="search" size={18} class="text-surface-600-400 shrink-0" />
  {/if}

  <input
    bind:value
    {placeholder}
    {onkeyup}
    aria-label={placeholder}
    class="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
    type="search"
  />

  {#if value.length > 0}
    <button class="btn-icon shrink-0" aria-label={m.common_clear()} onclick={onClear}>
      <Icon name="close" size={14} />
    </button>
  {/if}

  {#if trailing}
    {@render trailing()}
  {/if}
</div>
