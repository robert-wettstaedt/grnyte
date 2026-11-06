<!--
  A viewer button's tooltip, on a span around it: a popover or dialog trigger needs its own id and
  handlers on the button, so spreading the tooltip's onto the same element would break one of them.
-->
<script lang="ts">
  import KbdTooltip from '$lib/components/KbdTooltip/KbdTooltip.svelte'
  import type { Snippet } from 'svelte'
  import type { ClassValue } from 'svelte/elements'

  interface Props {
    children: Snippet
    class?: ClassValue
    /** The kbd badge. */
    key?: string
    label: string
  }

  const { children, class: className, key, label }: Props = $props()
</script>

<KbdTooltip {key} {label}>
  {#snippet trigger(attributes)}
    <span {...attributes} class={['inline-flex', className]}>
      {@render children()}
    </span>
  {/snippet}
</KbdTooltip>
