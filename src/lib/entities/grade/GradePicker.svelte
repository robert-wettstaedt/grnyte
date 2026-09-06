<script lang="ts">
  import { getGradeBand, gradeFgVar, gradeVar } from '$lib/entities/grade/color'
  import type { Grade } from '$lib/entities/grade/dto'
  import { gradeLabel, scaleRungs } from '$lib/entities/grade/label'
  import type { GradingScale } from '$lib/entities/user/dto'
  import Picker from '$lib/forms/Picker.svelte'
  import { m } from '$lib/paraglide/messages'

  // A grade is a name, not a position: a native select chip plus ± that nudge one rung, hidden
  // until something is picked. Rungs, not grades, so a V climber never sees the same label twice.
  interface Props {
    /** Grades ordered low → high. */
    grades: Grade[]
    gradingScale: GradingScale
    /** When set, the picked grade id submits through a hidden input with this name. */
    name?: string
    /** Selected grade id (`gradeFk`), or `undefined` for no suggestion. */
    value?: number | undefined
  }

  let { grades, gradingScale, name, value = $bindable() }: Props = $props()

  const rungs = $derived(scaleRungs(grades, gradingScale, value))
  const index = $derived(value == null ? -1 : rungs.findIndex((rung) => rung.id === value))
  const band = $derived(getGradeBand(value))

  // Only ever called with a grade already picked, since the ± are hidden until then.
  const step = (delta: number) => {
    const next = Math.min(rungs.length - 1, Math.max(0, index + delta))
    value = rungs[next]?.id
  }
</script>

{#if name != null}
  <input {name} type="hidden" value={value ?? ''} />
{/if}

<Picker
  atMax={index >= rungs.length - 1}
  atMin={index <= 0}
  decrementLabel={m.routes_form_gradeEasier()}
  empty={value == null}
  incrementLabel={m.routes_form_gradeHarder()}
  onclear={() => (value = undefined)}
  onstep={step}
  steppers={value != null}
>
  <!-- `overflow-hidden` and the chip's min width are load-bearing: a select's intrinsic ~54px
       would overhang a one-character chip and swallow the + button. -->
  <!-- The focus ring rides the wrapper, since the only focusable element is the `opacity-0` select. -->
  <span
    class="has-[select:focus-visible]:outline-primary-500 relative inline-flex overflow-hidden rounded-xl has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2"
  >
    <span
      class={[
        'inline-flex h-11.5 min-w-16 items-center justify-center rounded-xl px-3.5 font-mono text-base font-bold',
        value == null && 'border-surface-400-600 text-surface-600-400 border-[1.5px] border-dashed',
      ]}
      style={value == null ? '' : `background: ${gradeVar(band)}; color: ${gradeFgVar(band)}`}
    >
      {value == null ? `? ${m.routes_form_gradePick()}` : gradeLabel(grades, gradingScale, value)}
    </span>
    <select
      aria-label={m.routes_form_gradeLabel()}
      class="absolute inset-0 size-full cursor-pointer appearance-none text-base opacity-0"
      onchange={(event) => (value = event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value))}
      value={value == null ? '' : String(value)}
    >
      <option value="">{m.routes_form_gradeNone()}</option>
      {#each rungs as rung (rung.id)}
        <option value={String(rung.id)}>{rung.label}</option>
      {/each}
    </select>
  </span>
</Picker>
