<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import ClearButton from '$lib/forms/ClearButton.svelte'
  import { createPressRepeat } from '$lib/forms/pressRepeat'
  import type { Snippet } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'

  // THE stepper row: `− <something> +` with a Clear at the end, shared by GradePicker and
  // ConditionPicker. Press and hold on either button keeps stepping; see `pressRepeat`.
  interface Props {
    /** Disables the buttons at the ends of the range. */
    atMax?: boolean
    atMin?: boolean
    /** The stepper's middle: whatever control carries the value. */
    children: Snippet
    /** Accessible name for the decrement button, e.g. "One grade easier". */
    decrementLabel: string
    /** Hides Clear (keeping its slot) and drives `steppers` in the field that wants it. */
    empty: boolean
    /** Accessible name for the increment button. */
    incrementLabel: string
    onclear: () => void
    /** `-1` or `1`. The field decides what a step means. */
    onstep: (delta: number) => void
    /** Whether ± render at all. A grade chip hides them while unset; an empty number field keeps them. */
    steppers?: boolean
  }

  const {
    atMax = false,
    atMin = false,
    children,
    decrementLabel,
    empty,
    incrementLabel,
    onclear,
    onstep,
    steppers = true,
  }: Props = $props()

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)

  // `select-none` and `touch-manipulation` are load-bearing: iOS's text-selection callout at ~500ms
  // fires `pointercancel` and would abort every hold-to-repeat.
  const button =
    'border-surface-400-600 bg-surface-50-950 grid size-11.5 flex-none touch-manipulation place-items-center rounded-xl border select-none [-webkit-touch-callout:none] disabled:opacity-35'

  // Hoisted so the attachments never re-run: an inline `onstep` arrow would recreate them mid-hold
  // and tear down the repeat.
  const decrement = createPressRepeat(() => onstep(-1))
  const increment = createPressRepeat(() => onstep(1))
</script>

<div class="flex items-center gap-2.5">
  {#if steppers}
    <button
      aria-label={decrementLabel}
      class={button}
      disabled={atMin}
      transition:slide={{ axis: 'x', duration }}
      type="button"
      {@attach decrement}
    >
      <Icon name="minus" size={18} />
    </button>
  {/if}

  {@render children()}

  {#if steppers}
    <button
      aria-label={incrementLabel}
      class={button}
      disabled={atMax}
      transition:slide={{ axis: 'x', duration }}
      type="button"
      {@attach increment}
    >
      <Icon name="plus" size={18} />
    </button>
  {/if}

  <span class="flex-1"></span>
  <ClearButton class={empty ? 'invisible' : undefined} onclick={onclear} />
</div>
