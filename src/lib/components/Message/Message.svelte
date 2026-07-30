<script lang="ts">
  import { splitMessage } from '$lib/i18n/message'
  import type { Snippet } from 'svelte'

  interface Props {
    /** Paraglide key. Computed at runtime by callers like the activity feed's verbs. */
    key: string
    /** Plain-text params, plus any variant selector (`person: 'self'` for your own row). */
    params?: Record<string, unknown>
    /** Placeholder name in the message to what renders in its place, e.g. `{ actor, name }`. */
    parts: Record<string, Snippet>
  }

  let { key, params = {}, parts }: Props = $props()

  const segments = $derived(splitMessage(key, params, Object.keys(parts)))
</script>

<!-- Keyed by index, not content: a message can repeat a text segment. One line, so no stray whitespace. -->
<!-- prettier-ignore -->
{#each segments as segment, index (index)}{#if segment.part == null}{segment.text}{:else}{@render parts[segment.part]?.()}{/if}{/each}
