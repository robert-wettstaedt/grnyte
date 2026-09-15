<script module lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import Dialog from './Dialog.svelte'

  // The dialog portals its backdrop and card into <body>, so the canvas itself stays empty:
  // `layout: 'fullscreen'` keeps the preview from centring a zero-height box behind it.
  // No autodocs on purpose: a docs page renders every story into one document, and five
  // portalled, modal dialogs would stack on top of each other and hide the page.
  const { Story } = defineMeta({
    component: Dialog,
    parameters: { layout: 'fullscreen' },
    title: 'Components/Dialog',
  })

  type Args = ComponentProps<typeof Dialog>

  // Every pinned-open story passes `open` controlled with no `onOpenChange`, so the machine
  // never closes: Escape, a backdrop click and the header close button all leave the card
  // standing. That is what a screenshot wants; the "Delete, from a trigger" story below is
  // the uncontrolled one you can actually open and close.
  const noop = () => {}

  // Filler for the scrolling story, long enough to push the card past its 90vh cap.
  const paragraphs = Array.from({ length: 8 }, (_, index) => index + 1)
</script>

<!-- The workhorse shape: title, one line of prose, Cancel + a filled confirm.
     Cancel is `btn preset-tonal`, confirm is `btn preset-filled`, and the header close is a
     `btn-icon` wrapping a bare <svg>: the three button treatments the v5 CSS rewrites. -->
{#snippet confirm(args: Args)}
  <Dialog {...args}>
    {#snippet content()}
      {m.region_tagRemoveConfirm({ count: 12, name: 'Slab' })}
    {/snippet}
  </Dialog>
{/snippet}

<!-- Opened from a small tonal-error button with an icon in it, the way an ascent row deletes.
     The trigger is the part under test here; it renders in the canvas, not the portal. -->
{#snippet fromTrigger(args: Args)}
  <Dialog {...args}>
    {#snippet trigger(props)}
      <button {...props} type="button" class={[props.class, 'btn btn-sm preset-tonal-error']}>
        <Icon name="trash" size={13} />
        {m.common_delete()}
      </button>
    {/snippet}
    {#snippet content()}
      {m.ascents_deleteConfirm({ climber: 'Nora', name: 'Fingerboard Traverse', owner: 'other' })}
    {/snippet}
  </Dialog>
{/snippet}

<!-- Leaving a region: the same shape with the default `common_save` button label. -->
{#snippet leave(args: Args)}
  <Dialog {...args}>
    {#snippet content()}
      {m.region_leaveConfirm({ name: 'Frankenjura' })}
    {/snippet}
  </Dialog>
{/snippet}

<!-- Enough prose to pass max-h-[90vh]: the card scrolls its own body while the header and
     footer scroll with it, which is where a changed line-height shows up first. -->
{#snippet longContent(args: Args)}
  <Dialog {...args}>
    {#snippet content()}
      <div class="space-y-3">
        {#each paragraphs as paragraph (paragraph)}
          <p>
            Paragraph {paragraph} of story-only filler. The card caps at 90% of the viewport and scrolls inside itself, so
            the header, the description and the footer all have to hold their spacing while the middle moves.
          </p>
        {/each}
      </div>
    {/snippet}
  </Dialog>
{/snippet}

<!-- Remove a tag: the confirm every settings screen shows. -->
<Story
  name="Confirm"
  args={{ onsave: noop, open: true, saveText: m.common_remove(), title: m.region_tagRemove() }}
  template={confirm}
/>

<!-- Mid-save: the confirm button is disabled and carries the circular indicator beside its
     label, so the button grows an inline child that is not an icon. -->
<Story
  name="Saving"
  args={{ onsave: noop, open: true, pending: 1, saveText: m.common_remove(), title: m.region_tagRemove() }}
  template={confirm}
/>

<!-- Default save label (`common_save`), which a caller that is not deleting anything keeps. -->
<Story name="Default save label" args={{ onsave: noop, open: true, title: m.region_leave() }} template={leave} />

<!-- No `onsave`: the whole footer is gone and the header close button is the only way out. -->
<Story name="Message only" args={{ open: true, title: m.region_tagRemove() }} template={confirm} />

<!-- The one interactive story: uncontrolled, so the trigger opens it and Cancel closes it. -->
<Story
  name="Delete, from a trigger"
  args={{ onsave: noop, saveText: m.ascents_delete(), title: m.ascents_delete() }}
  parameters={{ layout: 'centered' }}
  template={fromTrigger}
/>

<!-- Overflowing body against the 90vh cap. Story-only copy, since no shipped dialog is this long. -->
<Story name="Scrolling content" args={{ onsave: noop, open: true, title: 'Scrolling body' }} template={longContent} />
