<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import type { ClassValue } from 'svelte/elements'

  // THE clear-field affordance: a small text "Clear" (the GradeSlider convention),
  // shared so every clearable input looks and behaves the same. Generous padding with
  // cancelling negative margins gives a ~40px touch target with zero layout footprint.
  interface Props {
    class?: ClassValue
    onclick: () => void
  }

  const { class: className, onclick }: Props = $props()
</script>

<button
  class={['text-surface-600-400 -mx-3 -my-3 rounded-lg px-3 py-3 text-xs font-semibold', className]}
  {onclick}
  type="button"
>
  {m.common_clear()}
</button>
