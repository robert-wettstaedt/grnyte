<script module lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import BlockLocationConfirm from './BlockLocationConfirm.svelte'

  // The dialog portals into <body>, so the canvas stays empty and gets no padding. No autodocs:
  // a docs page renders every story into one document, and three portalled modal dialogs would
  // stack on top of each other.
  //
  // `open` is controlled and the three callbacks are no-ops, so nothing can dismiss the card:
  // Escape, a backdrop tap and either button all leave it standing for a screenshot.
  const noop = () => {}

  const { Story } = defineMeta({
    args: { onCancel: noop, onConfirm: noop, onPinNow: noop, open: true },
    component: BlockLocationConfirm,
    parameters: { layout: 'fullscreen' },
    title: 'Entities/Block/BlockLocationConfirm',
  })
</script>

<!-- Adding a block with no location: the default copy. The warning badge, the filled primary
     with a map-pin icon inside it, and the bordered ghost below are the three treatments the
     Skeleton upgrade can move (button padding, the svg-in-button rule, preset-tonal colours). -->
<Story name="Add a block" />

<!-- The same dialog from the edit flow, which overrides the title and the secondary label to
     "Save …" wording. The longer label is the one that would wrap first. -->
<Story
  name="Edit a block"
  args={{ confirmLabel: m.blocks_edit_saveWithoutLocation(), title: m.blocks_edit_confirmTitle() }}
/>

<!-- Below the sm breakpoint the positioner anchors the card to the bottom edge and it becomes a
     full-width sheet with only its top corners rounded. The viewport global drives the real
     iframe width, which is what the media query reads; resize the preview to check other widths. -->
<Story name="Phone sheet" globals={{ viewport: { value: '375-667' } }} />
