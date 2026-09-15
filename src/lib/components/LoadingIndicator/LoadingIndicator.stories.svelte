<script module lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import LoadingIndicator from './LoadingIndicator.svelte'

  const { Story } = defineMeta({
    component: LoadingIndicator,
    parameters: { layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/LoadingIndicator',
  })

  // The wrapper pins `value={null}`, so there is no determinate variant to story: every state below
  // is the same spinning indeterminate ring, and only its box and its two strokes differ. Those
  // strokes are theme tokens (range `--color-primary-500`, track `--color-surface-200-800`) and the
  // ring is sized through a `--size` custom property, which is what makes these worth diffing.
</script>

{#snippet sizes()}
  <div style="display: flex; align-items: center; gap: 24px;">
    <LoadingIndicator class="w-fit" size={4} />
    <LoadingIndicator class="w-fit" size={6} />
    <LoadingIndicator class="w-fit" size={8} />
    <LoadingIndicator class="w-fit" size={12} />
    <LoadingIndicator class="w-fit" size={20} />
  </div>
{/snippet}

{#snippet splash()}
  <div class="bg-surface-950 flex items-center justify-center" style="width: 360px; height: 320px;">
    <LoadingIndicator class="flex h-full w-full items-center justify-center" size={20} />
  </div>
{/snippet}

{#snippet inlineWithLabel()}
  <div
    class="bg-surface-100-900 border-surface-200-800 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap shadow-lg"
  >
    <LoadingIndicator class="w-fit shrink-0" size={4} />
    {m.map_loading()}
  </div>
{/snippet}

{#snippet inTextButton()}
  <div style="display: flex; align-items: center; gap: 12px;">
    <button class="btn preset-filled-primary-500" type="button">
      <LoadingIndicator />
      {m.common_save()}
    </button>

    <button class="btn preset-filled-primary-500" disabled type="button">
      <LoadingIndicator />
      {m.common_save()}
    </button>

    <button class="btn preset-tonal-surface" type="button">
      <LoadingIndicator />
      {m.common_cancel()}
    </button>
  </div>
{/snippet}

{#snippet inIconButton()}
  <!-- The ring replaces the icon outright, so each button needs a name of its own to stay reachable
       while it spins, exactly as the live filter button does. -->
  <div style="display: flex; align-items: center; gap: 12px;">
    <button
      class="btn-icon preset-filled-primary-500 relative shrink-0 gap-1.5"
      aria-label={m.media_loading()}
      type="button"
    >
      <LoadingIndicator class="flex justify-center" size={4} />
    </button>

    <button
      class="btn-icon preset-filled-surface-200-800 relative shrink-0 gap-1.5"
      aria-label={m.media_loading()}
      type="button"
    >
      <LoadingIndicator class="flex justify-center" size={4} />
    </button>

    <button
      class="btn-icon preset-filled-surface-200-800 relative shrink-0 gap-1.5"
      aria-label={m.media_loading()}
      disabled
      type="button"
    >
      <LoadingIndicator class="flex justify-center" size={4} />
    </button>
  </div>
{/snippet}

{#snippet inLargeSaveButton()}
  <button aria-pressed="false" class="btn btn-lg preset-tonal text-base" disabled type="button">
    <LoadingIndicator size="19px" />

    <span class="flex flex-col items-start leading-none">
      <span class="text-sm leading-none font-bold">{m.common_save()}</span>
      <span class="text-[10px] leading-none font-normal opacity-80">Saved by 3 others</span>
    </span>
  </button>
{/snippet}

{#snippet onMediaScrim()}
  <div
    class="border-surface-300-700 bg-surface-100-900 relative overflow-hidden rounded-xl border"
    style="width: 96px; height: 96px;"
  >
    <span class="absolute inset-0 flex items-center justify-center bg-black/40">
      <LoadingIndicator class="w-fit" size={4} />
    </span>
  </div>
{/snippet}

{#snippet tintedStrokes()}
  <div
    class="preset-filled-primary-500 flex items-center justify-center rounded-xl"
    style="width: 160px; height: 120px;"
  >
    <LoadingIndicator class="w-fit" rangeClass="stroke-white" size={12} trackClass="stroke-white/30" />
  </div>
{/snippet}

<!-- Bare default: `size` 4, the inline size most callers take, with `size` and the class props
     live as controls. -->
<Story name="Default" />

<!-- Every step of the numeric scale. 4 sits next to text, 20 is the full-screen splash; 6, 8 and 12
     are API surface with no caller today. `w-fit` because the Progress root is `width: 100%` on a
     horizontal orientation and would otherwise stretch each cell of the row. -->
<Story name="Sizes" template={sizes} />

<!-- App boot and the shell's own loading gate: size 20 centred on the surface with nothing else on
     screen. The live version is `fixed inset-0`, which would escape the canvas, so this pins the
     same centring inside a box. -->
<Story name="Splash" template={splash} />

<!-- The map's loading pill: size 4 inline ahead of a label, inside a bordered rounded chip. -->
<Story name="Inline with label" template={inlineWithLabel} />

<!-- Pending save, the shape the block-order header and the dialog footer both use: the default ring
     takes the icon slot inside a text button. Button padding, line height and the gap between ring
     and label all move underneath this, so the disabled and tonal buttons sit here too. -->
<Story name="In text button" template={inTextButton} />

<!-- The map filter button while its routes load: a size 4 ring standing in for the 14px filter icon
     inside `btn-icon`, on the active (filled primary) and idle (filled surface) presets. `btn-icon`
     is a fixed square, so this is the story that catches a box-model change. -->
<Story name="In icon button" template={inIconButton} />

<!-- SaveButton mid-write. The only caller of the string `size` form, here `19px` to match the 19px
     bookmark icon it replaces so the button does not resize under the pointer. `btn-lg` sits on the
     type scale, so watch the ring staying centred against the stacked label. -->
<Story name="In large save button" template={inLargeSaveButton} />

<!-- A staged or finalizing upload tile: the ring sits on a dark scrim over the thumbnail, so the
     track stroke has to read against black rather than against the surface ramp. -->
<Story name="On media scrim" template={onMediaScrim} />

<!-- `rangeClass` and `trackClass` reach the two SVG strokes. No caller uses them today, but they are
     the documented escape hatch for a ring on a coloured ground, and stroke utilities are exactly
     what a preset change can break. -->
<Story name="Tinted strokes" template={tintedStrokes} />
