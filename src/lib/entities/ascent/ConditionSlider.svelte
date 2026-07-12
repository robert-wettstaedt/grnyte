<script lang="ts">
  import ClearButton from '$lib/forms/ClearButton.svelte'
  import { Slider } from '@skeletonlabs/skeleton-svelte'

  // Optional numeric slider (temperature, humidity): a label/value header row over a
  // full-width track, so the track stays usable on phones. Unset shows a faded track
  // with a ghost mid thumb; the first drag picks a value. The plain-number sibling
  // of GradeSlider.
  // ponytail: lives here next to its only consumer; move to components/ with a second one.
  interface Props {
    /** Inline label, doubles as the slider's accessible name. */
    label: string
    min: number
    max: number
    step?: number
    /** Render the picked value, e.g. `${value} %`. */
    format: (value: number) => string
    /** When set, the value submits through a hidden input with this name (empty when unset). */
    name?: string
    value?: number | undefined
  }

  let { label, min, max, step = 1, format, name, value = $bindable() }: Props = $props()
</script>

{#if name != null}
  <input {name} type="hidden" value={value ?? ''} />
{/if}

<div class="flex flex-col gap-1">
  <div class="flex items-center gap-3">
    <span class="text-surface-600-400 text-xs font-semibold">{label}</span>
    <span class="flex-1"></span>
    <!-- the clear button keeps its slot (invisible, not removed) so setting or clearing a value never shifts the row. -->
    <span class="font-mono text-xs font-bold">{value == null ? '' : format(value)}</span>
    <ClearButton class={value == null ? 'invisible' : undefined} onclick={() => (value = undefined)} />
  </div>

  <div class="px-2">
    <Slider
      aria-label={[label]}
      {max}
      {min}
      onValueChange={(details) => (value = details.value[0])}
      {step}
      thumbAlignment="center"
      value={[value ?? Math.round((min + max) / 2)]}
    >
      <Slider.Control class="relative flex items-center py-2">
        <Slider.Track class={['bg-surface-300-700 relative h-1.5 w-full rounded-full', value == null && 'opacity-40']}>
          {#if value != null}
            <Slider.Range class="bg-primary-500 h-full rounded-full" />
          {/if}
        </Slider.Track>

        <Slider.Thumb
          class={[
            'border-surface-50-950 size-5 rounded-full border-2 shadow focus-visible:outline-2',
            value == null ? 'border-surface-400-600 border-dashed bg-transparent shadow-none' : 'bg-primary-500',
          ]}
          index={0}
        />
      </Slider.Control>
    </Slider>
  </div>
</div>
