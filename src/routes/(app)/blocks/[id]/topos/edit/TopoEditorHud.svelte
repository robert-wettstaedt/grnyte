<script lang="ts">
  import { browser } from '$app/environment'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import KbdTooltip from '$lib/components/KbdTooltip/KbdTooltip.svelte'
  import type { TopoEditor } from '$lib/entities/topo/editor.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { scale } from 'svelte/transition'

  interface Props {
    editor: TopoEditor
    isFullscreen: boolean
    /** Whether topo lines are hidden on the stage (two-way; the eye toggle flips it). */
    linesHidden: boolean
    onLeave: () => void
    onResetZoom: () => void
    onSave: () => void
    onToggleFullscreen: () => void
    saving: boolean
    /** True when the stage is at its neutral 1x view (hides the reset-zoom pill). */
    viewAtRest: boolean
    zoom: number
  }

  let {
    editor,
    isFullscreen,
    linesHidden = $bindable(),
    onLeave,
    onResetZoom,
    onSave,
    onToggleFullscreen,
    saving,
    viewAtRest,
    zoom,
  }: Props = $props()

  // Keybind hints for the tooltips. The modifier tracks the OS so Windows/Linux users see Ctrl, not
  // ⌘ (the page's keydown handler already accepts either). Guarded for SSR (no navigator).
  const isMac = browser && /Mac|iP(hone|ad|od)/.test(navigator.userAgent)
  const mod = isMac ? '⌘' : 'Ctrl+'
  const shift = isMac ? '⇧' : 'Shift+'

  const linesLabel = $derived(linesHidden ? m.topo_showLines() : m.topo_hideLines())
  const fullscreenLabel = $derived(isFullscreen ? m.topo_exitFullscreen() : m.topo_fullscreen())
</script>

<div class="pointer-events-none absolute top-0 left-0 z-30 flex items-start gap-2 p-3">
  <div class="pointer-events-auto flex flex-col gap-2">
    <KbdTooltip label={m.common_back()}>
      {#snippet trigger(attributes)}
        <button
          {...attributes}
          class="btn-icon preset-filled-surface-50-950 shadow-lg"
          aria-label={m.common_back()}
          onclick={onLeave}
        >
          <Icon name="arrow-left" />
        </button>
      {/snippet}
    </KbdTooltip>

    <div class="flex gap-2">
      <KbdTooltip label={m.editor_undo()} key={`${mod}Z`}>
        {#snippet trigger(attributes)}
          <button
            {...attributes}
            class="btn-icon preset-filled-surface-50-950 shadow-lg"
            aria-label={m.editor_undo()}
            disabled={!editor.canUndo}
            onclick={() => editor.undo()}
          >
            <Icon name="undo" />
          </button>
        {/snippet}
      </KbdTooltip>

      <KbdTooltip label={m.editor_redo()} key={`${mod}${shift}Z`}>
        {#snippet trigger(attributes)}
          <button
            {...attributes}
            class="btn-icon preset-filled-surface-50-950 shadow-lg"
            aria-label={m.editor_redo()}
            disabled={!editor.canRedo}
            onclick={() => editor.redo()}
          >
            <Icon name="redo" />
          </button>
        {/snippet}
      </KbdTooltip>
    </div>
  </div>
</div>

<!-- Top-right: a vertical tool column, so a narrow phone never pushes tools off-screen. -->
<div class="pointer-events-none absolute top-0 right-0 z-30 flex flex-col items-end gap-2 p-3">
  <div class="pointer-events-auto flex flex-col items-end gap-2">
    <KbdTooltip label={linesLabel}>
      {#snippet trigger(attributes)}
        <button
          {...attributes}
          class="btn-icon preset-filled-surface-50-950 shadow-lg"
          aria-label={linesLabel}
          aria-pressed={linesHidden}
          onclick={() => (linesHidden = !linesHidden)}
        >
          <Icon name={linesHidden ? 'eye-off' : 'eye'} />
        </button>
      {/snippet}
    </KbdTooltip>
    <KbdTooltip label={fullscreenLabel} key="F">
      {#snippet trigger(attributes)}
        <button
          {...attributes}
          class="btn-icon preset-filled-surface-50-950 shadow-lg"
          aria-label={fullscreenLabel}
          aria-pressed={isFullscreen}
          onclick={onToggleFullscreen}
        >
          <Icon name={isFullscreen ? 'minimize' : 'maximize'} />
        </button>
      {/snippet}
    </KbdTooltip>
    {#if !viewAtRest}
      <KbdTooltip label={m.topo_resetZoom()}>
        {#snippet trigger(attributes)}
          <button
            {...attributes}
            class="preset-filled-surface-50-950 flex items-center rounded-lg p-2 text-xs font-bold tabular-nums shadow-lg"
            transition:scale|global={{ duration: 150, start: 0.8 }}
            aria-label={m.topo_resetZoom()}
            onclick={onResetZoom}
          >
            {(Math.round(zoom * 10) / 10).toFixed(1)}x
          </button>
        {/snippet}
      </KbdTooltip>
    {/if}
  </div>
</div>

<!-- Save / saved pill: its own centred row below the top bar, so its width never
     collides with the corner tool groups on a narrow phone. -->
<div class="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3">
  <!-- Grid-stack so both pills share one centred cell; scale grows each from its centre
       (both edges move outward) instead of a one-sided width collapse. -->
  <div class="pointer-events-auto grid justify-items-center *:col-start-1 *:row-start-1">
    {#if editor.dirty}
      <div
        class="preset-filled-surface-50-950 flex items-center gap-1 rounded-full p-1 shadow-lg"
        transition:scale={{ duration: 200, start: 0.8 }}
      >
        <span class="bg-warning-500 ml-1.5 size-2 rounded-full"></span>
        <span class="px-1 text-xs font-semibold">{m.topo_unsavedShort()}</span>
        <button
          class="btn btn-sm preset-tonal-surface rounded-full"
          disabled={saving}
          onclick={() => editor.discardAll()}
        >
          {m.topo_discard()}
        </button>
        <KbdTooltip label={m.topo_save()} key={`${mod}S`}>
          {#snippet trigger(attributes)}
            <button
              {...attributes}
              class="btn btn-sm preset-filled-primary-500 rounded-full"
              disabled={saving}
              onclick={onSave}
            >
              {m.topo_save()}
            </button>
          {/snippet}
        </KbdTooltip>
      </div>
    {:else}
      <div
        class="preset-filled-surface-50-950 text-surface-600-400 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-lg"
        transition:scale={{ duration: 200, start: 0.8 }}
      >
        <Icon name="check" size={14} />
        {m.topo_saved()}
      </div>
    {/if}
  </div>
</div>
