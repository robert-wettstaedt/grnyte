<!-- The one card a screen shows when its query failed, so the failure reads the same everywhere. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages.js'
  import { motion } from '$lib/state/motion.svelte'
  import { fade } from 'svelte/transition'

  interface Props {
    /** A line inside a section rather than a card filling the screen. */
    compact?: boolean
  }

  const { compact = false }: Props = $props()
</script>

<!-- One root, not an `if`: a local intro only plays on an element its own block creates. -->
<div
  class={compact ? 'text-error-600-400 text-sm' : 'card preset-tonal-error px-4 py-3 text-sm'}
  role="alert"
  in:fade={{ duration: motion() }}
>
  {m.queryState_error()}
</div>
