<!--
  The temperature and humidity an ascent was logged with, as one pill.

  Its own component because three screens show it (the ascent row, the media stage, the feed
  card) and they have to look identical: what the reader recognises here is the shape, not the
  words. It was the same fifteen classes written out three times before this.

  Renders nothing when there are no conditions, so callers can hand it their values without
  guarding first.
-->
<script lang="ts">
  import { formatConditions } from '$lib/i18n/units.svelte'

  interface Props {
    /** Extra classes for the odd caller that has to place it (`self-start` in a flex column). */
    class?: string
    humidity: null | number | undefined
    temperature: null | number | undefined
  }

  const { class: className = '', humidity, temperature }: Props = $props()

  const conditions = $derived(formatConditions(temperature ?? undefined, humidity ?? undefined))
</script>

{#if conditions !== ''}
  <span
    class="border-surface-200-800 bg-surface-100-900 text-surface-600-400 inline-flex h-6.25 items-center rounded-full border px-2.5 font-mono text-[11px] font-bold {className}"
  >
    {conditions}
  </span>
{/if}
