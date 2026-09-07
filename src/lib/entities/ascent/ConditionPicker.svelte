<script lang="ts">
  import Picker from '$lib/forms/Picker.svelte'
  import { m } from '$lib/paraglide/messages'

  // Optional numeric field (temperature, humidity): a label row over a stepper, the plain-number
  // sibling of GradePicker. A real number input, not a select, so a known value can just be typed.
  interface Props {
    /** Formats the shown value for the header, in the unit the input takes. */
    format: (shown: number) => string
    /** Shown → stored. Identity when omitted. */
    fromInput?: (shown: number) => number
    /** Inline label, doubles as the field's accessible name. */
    label: string
    /** In display units, like `min` and `step`. */
    max: number
    min: number
    /** What ± moves by. Typing still takes any whole number in range. */
    step?: number
    /** Stored → shown. Identity when omitted. */
    toInput?: (stored: number) => number
    /** The unit the input takes and shows, e.g. `°C`, `°F`, `%`. */
    unit: string
    value?: number | undefined
  }

  let {
    format,
    fromInput = (shown: number) => shown,
    label,
    max,
    min,
    step = 1,
    toInput = (stored: number) => stored,
    unit,
    value = $bindable(),
  }: Props = $props()

  // `min`, `max`, `step` and everything below are in display units; `value` alone is what is stored.
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  const store = (shown: number) => Math.round(fromInput(clamp(shown)))

  /**
   * What the box shows. Local, not derived: the round trip is lossy (60 °F stores as 16 °C and
   * reads back as 61 °F), so it re-syncs only when the draft no longer describes `value`.
   */
  // svelte-ignore state_referenced_locally
  let shown = $state<number | undefined>(value == null ? undefined : Math.round(toInput(value)))
  $effect(() => {
    if (value == null) {
      shown = undefined
    } else if (shown == null || store(shown) !== value) {
      shown = Math.round(toInput(value))
    }
  })

  /** Where the first press lands, so ± works from empty without inventing an edge. */
  const seed = $derived(Math.round((min + max) / 2 / step) * step)

  const onstep = (delta: number) => {
    const next = shown == null ? seed : clamp(shown + delta * step)
    shown = next
    value = store(next)
  }

  const oninput = (event: Event & { currentTarget: HTMLInputElement }) => {
    const field = event.currentTarget

    // A lone "-" is `badInput` and reads back as '', so clearing here would eat the minus key.
    // Anything still unparseable is dealt with on blur.
    if (field.validity.badInput) {
      return
    }

    if (field.value === '') {
      shown = undefined
      value = undefined
      return
    }

    // Taken as typed, NOT clamped. A half-typed number is usually out of range: on the Fahrenheit
    // field (14..104) the "7" of "70" would clamp up to 14 and rewrite the box, so nothing below
    // 100 could be typed at all. Range is settled on blur, once the number is whole.
    const typed = Math.round(Number(field.value))
    shown = typed
    value = store(typed)
  }

  /**
   * What can only be judged once the number is finished.
   *
   * Clamps, and snaps the box to what was actually stored so it agrees with every other rendering
   * of the same temperature: 60 °F stores as 16 °C and reads back as 61 °F, and leaving 60 in the
   * box makes the collapsed summary beside it disagree.
   *
   * `badInput` ("1e", "-") blocks the form's submit event entirely and makes Save look dead.
   * Cleared here, not per keystroke, so a number can still be typed one character at a time.
   */
  const onblur = (event: FocusEvent & { currentTarget: HTMLInputElement }) => {
    const field = event.currentTarget
    if (field.validity.badInput) {
      field.value = ''
      shown = undefined
      value = undefined
      return
    }
    if (shown != null) {
      value = store(shown)
      shown = Math.round(toInput(value))
      field.value = String(shown)
    }
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center gap-3">
    <span class="text-surface-600-400 text-xs font-semibold">{label}</span>
    <span class="flex-1"></span>
    <!-- Formatted here, so the input itself can stay a bare number. -->
    <span class="font-mono text-xs font-bold">{shown == null ? '' : format(shown)}</span>
  </div>

  <Picker
    atMax={shown != null && shown >= max}
    atMin={shown != null && shown <= min}
    decrementLabel={m.ascents_form_conditionDown({ label })}
    empty={value == null}
    incrementLabel={m.ascents_form_conditionUp({ label })}
    onclear={() => (value = undefined)}
    {onstep}
  >
    <!-- The unit sits over the input's own end padding, so the input keeps its border and the app's
         global focus ring. `inputmode="numeric"` only when the range cannot go negative: iOS's
         digit pad has no minus key. -->
    <span class="relative flex-none">
      <input
        aria-label={`${label} (${unit})`}
        class="border-surface-400-600 bg-surface-50-950 h-11.5 w-28 [appearance:textfield] rounded-xl border ps-3 pe-9 text-end font-mono text-base font-bold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        inputmode={min < 0 ? undefined : 'numeric'}
        {max}
        {min}
        {onblur}
        {oninput}
        placeholder="–"
        step={1}
        type="number"
        value={shown ?? ''}
      />
      <span
        class="text-surface-600-400 pointer-events-none absolute inset-y-0 inset-e-3 flex items-center font-mono text-sm font-semibold"
      >
        {unit}
      </span>
    </span>
  </Picker>
</div>
