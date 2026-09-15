<script module lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import KbdTooltip from './KbdTooltip.svelte'

  const { Story } = defineMeta({
    component: KbdTooltip,
    parameters: { layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/KbdTooltip',
  })

  /**
   * KbdTooltip exposes no `open` prop and hard-codes the 300ms open delay, so the bubble exists only
   * while something hovers the trigger. This nudges the story's first trigger with a synthetic
   * `pointerover` on load and waits for the content to appear, so the tooltip is part of the story
   * rather than something you chase with a mouse. Only the first trigger is nudged, which is also
   * all a real pointer could do: the tooltips share a store that keeps one bubble open at a time.
   *
   * The content is portalled to `<body>` by the positioner, which is why it is looked up on
   * `document` rather than inside the canvas.
   */
  const openTooltip = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const trigger = canvasElement.querySelector('[data-scope="tooltip"][data-part="trigger"]')

    // A coarse pointer fails the component's `(hover: hover)` check, so it renders the bare trigger
    // carrying a native `title` and there is no tooltip to open. Nothing to do, and nothing to fail.
    if (trigger == null) {
      return
    }

    trigger.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (document.querySelector('[data-scope="tooltip"][data-part="content"]') != null) {
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  // Every trigger in the app is an icon button, and the icon is a bare <svg> child of that button,
  // which is the shape most exposed to a button box-model change.
  const iconButtonClass = 'btn-icon preset-filled-surface-200-800'
  const hudButtonClass = 'btn-icon preset-filled-surface-50-950 shadow-lg'

  // Story-only stand-in for the entity display name SiblingNav passes through as the label.
  const longRouteName = 'Der lange Weg zum Gipfel des Steinernen Meeres'
</script>

{#snippet nextTrigger(attributes: Record<string, unknown>)}
  <button {...attributes} class={iconButtonClass} aria-label={m.common_next()} type="button">
    <Icon name="chevron-right" size={18} />
  </button>
{/snippet}

{#snippet withoutKeybind()}
  <!-- The topo editor's back button: a label with no keybind, so the bubble carries no kbd badge. -->
  <KbdTooltip label={m.common_back()}>
    {#snippet trigger(attributes)}
      <button {...attributes} class={hudButtonClass} aria-label={m.common_back()} type="button">
        <Icon name="arrow-left" />
      </button>
    {/snippet}
  </KbdTooltip>
{/snippet}

{#snippet modifierKeybind()}
  <!-- The editor's undo/redo pair. `⌘⇧Z` is the widest badge shipped, so it is the one that shows a
       kbd padding or line-height change first. -->
  <div style="display: flex; align-items: center; gap: 8px;">
    <KbdTooltip label={m.editor_undo()} key="⌘Z">
      {#snippet trigger(attributes)}
        <button {...attributes} class={hudButtonClass} aria-label={m.editor_undo()} type="button">
          <Icon name="undo" />
        </button>
      {/snippet}
    </KbdTooltip>

    <KbdTooltip label={m.editor_redo()} key="⌘⇧Z">
      {#snippet trigger(attributes)}
        <button {...attributes} class={hudButtonClass} aria-label={m.editor_redo()} type="button">
          <Icon name="redo" />
        </button>
      {/snippet}
    </KbdTooltip>
  </div>
{/snippet}

{#snippet longLabel()}
  <!-- SiblingNav feeds the tooltip an entity display name, which is user data and can run long.
       The content sets no max width and no nowrap, so this is where a wrapping bubble shows up. -->
  <KbdTooltip label={longRouteName} key="J">
    {#snippet trigger(attributes)}
      <button {...attributes} class={iconButtonClass} aria-label={longRouteName} type="button">
        <Icon name="chevron-left" size={18} />
      </button>
    {/snippet}
  </KbdTooltip>
{/snippet}

{#snippet largeTrigger()}
  <!-- SiblingNav's `large` variant, the mobile sheet pill: same tooltip, a bigger touch target.
       `btn-icon-lg` sits on the size scale, so the gap between the two boxes is worth a look. -->
  <div style="display: flex; align-items: center; gap: 8px;">
    <KbdTooltip label={m.common_next()} key="L">
      {#snippet trigger(attributes)}
        <button {...attributes} class="{iconButtonClass} btn-icon-lg" aria-label={m.common_next()} type="button">
          <Icon name="chevron-right" size={18} />
        </button>
      {/snippet}
    </KbdTooltip>

    <KbdTooltip label={m.common_next()} key="L">
      {#snippet trigger(attributes)}
        <button {...attributes} class={iconButtonClass} aria-label={m.common_next()} type="button">
          <Icon name="chevron-right" size={18} />
        </button>
      {/snippet}
    </KbdTooltip>
  </div>
{/snippet}

{#snippet disabledTrigger()}
  <!-- Undo with nothing to undo. A disabled button emits no pointer events, so the tooltip never
       opens and the hint is simply unavailable; the enabled twin sits beside it for the contrast.
       This story deliberately runs no play function, because there is nothing to open. -->
  <div style="display: flex; align-items: center; gap: 8px;">
    <KbdTooltip label={m.editor_undo()} key="⌘Z">
      {#snippet trigger(attributes)}
        <button {...attributes} class={hudButtonClass} aria-label={m.editor_undo()} disabled type="button">
          <Icon name="undo" />
        </button>
      {/snippet}
    </KbdTooltip>

    <KbdTooltip label={m.editor_redo()} key="⌘⇧Z">
      {#snippet trigger(attributes)}
        <button {...attributes} class={hudButtonClass} aria-label={m.editor_redo()} type="button">
          <Icon name="redo" />
        </button>
      {/snippet}
    </KbdTooltip>
  </div>
{/snippet}

<!-- SiblingNav's next chevron: an icon button with a single-letter hint. `label` and `key` are live
     controls here, the trigger is fixed. -->
<Story name="Default" args={{ key: 'L', label: m.common_next(), trigger: nextTrigger }} play={openTooltip} />

<!-- Label only: the bubble drops the kbd badge and shrinks to the text. -->
<Story name="Without keybind" template={withoutKeybind} play={openTooltip} />

<!-- Modifier hints, the widest badges in the app. -->
<Story name="Modifier keybind" template={modifierKeybind} play={openTooltip} />

<!-- A user-supplied name as the label, which is what SiblingNav passes. -->
<Story name="Long label" template={longLabel} play={openTooltip} />

<!-- The large touch-target variant next to the standard one. -->
<Story name="Large trigger" template={largeTrigger} play={openTooltip} />

<!-- Disabled trigger: no tooltip, by design. -->
<Story name="Disabled trigger" template={disabledTrigger} />
