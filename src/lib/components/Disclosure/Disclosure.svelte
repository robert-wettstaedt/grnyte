<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ClassValue } from 'svelte/elements'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'

  // A button and an {#if} rather than <details>: a <details> keeps its panel in the DOM and only
  // hides it, so there is nothing being added for a transition to run on and it snaps open.
  interface Props {
    /** The panel, mounted only while open. */
    children: Snippet
    /** Classes for the wrapper. */
    class?: ClassValue
    open?: boolean
    panelClass?: ClassValue
    /** The trigger's content. Gets `open`, so the caller points its own chevron. */
    summary: Snippet<[boolean]>
    summaryClass?: ClassValue
    /** The trigger, for a caller that needs to focus or scroll to it. */
    trigger?: HTMLButtonElement
  }

  let {
    children,
    class: className,
    open = $bindable(false),
    panelClass,
    summary,
    summaryClass,
    trigger = $bindable(),
  }: Props = $props()

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)
</script>

<div class={className}>
  <button
    bind:this={trigger}
    aria-expanded={open}
    class={['cursor-pointer text-left select-none', summaryClass]}
    onclick={() => (open = !open)}
    type="button"
  >
    {@render summary(open)}
  </button>

  {#if open}
    <div class={panelClass} transition:slide={{ duration }}>
      {@render children()}
    </div>
  {/if}
</div>
