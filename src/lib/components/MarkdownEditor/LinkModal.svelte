<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'
  import LinkForm from './LinkForm.svelte'

  interface Props {
    /** Whether a link mark is active at the current selection (button highlight). */
    active?: boolean
    /** Read the live editor selection to seed the form each time it opens. */
    getInitial: () => { href: string; text: string }
    /** Confirmed: insert/update the link. */
    onsubmit: (value: { href: string; text: string }) => void
    /**
     * Bound out so the editor knows its dialog is up.
     *
     * The content renders through a `<Portal>`, so focus moving into it looks, from the editor's
     * wrapper, exactly like focus leaving the editor: a compact toolbar folds away and takes this
     * dialog's own trigger with it. Owned here, read there.
     */
    open?: boolean
  }

  // The submit affordance lives in the mobile sheet header (outside the form), so
  // the form values are held here and shared with both it and the footer button.
  let { active = false, getInitial, onsubmit, open = $bindable(false) }: Props = $props()
  let text = $state('')
  let href = $state('')
  const canSubmit = $derived(href.trim().length > 0)

  // Toolbar toggle: seed from the current selection on open so the form always
  // reflects what's highlighted in the editor.
  const toggle = () => {
    if (open) {
      open = false
      return
    }
    const initial = getInitial()
    text = initial.text
    href = initial.href
    open = true
  }

  const submit = () => {
    if (!canSubmit) {
      return
    }
    open = false
    onsubmit({ href: href.trim(), text: text.trim() })
  }
</script>

<!-- Centred and modal rather than anchored to the toolbar button.

     On desktop the default branch is a popover hung off its trigger, which for a composer at the
     bottom of a sheet meant a form pinned to the bottom-left corner of the screen. On a phone the
     sheet it is opened from is itself a portaled sheet, so without `nested` this one renders
     UNDER it: the reader taps the link button and nothing appears to happen. `nested` is the
     z-index tier `Modal.mobile` keeps for exactly this, a sheet over a sheet.

     The editor also lives on ordinary form pages, where there is no sheet under it. `nested` is
     harmless there: it raises this above other sheets, and there are none. -->
<Modal
  backdrop
  contentClass="w-full max-w-sm"
  nested
  bind:open
  panel
  panelClass="fixed inset-0 z-70 flex items-center justify-center p-4"
  title={m.editor_linkTitle()}
>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      aria-label={m.editor_insertLink()}
      aria-pressed={active}
      class={[props.class, 'btn-icon hover:preset-tonal', active && 'preset-filled-primary-500']}
      onclick={toggle}
    >
      <Icon name="link" size={18} strokeWidth={2.1} />
    </button>
  {/snippet}

  {#snippet headerLeft()}
    <button
      type="button"
      class="btn-icon preset-filled-surface-500"
      onclick={() => (open = false)}
      title={m.common_back()}
    >
      <Icon name="close" />
    </button>
  {/snippet}

  {#snippet headerRight()}
    <button
      type="button"
      class="btn-icon preset-filled-primary-500"
      title={m.editor_insertLink()}
      disabled={!canSubmit}
      onclick={submit}
    >
      <Icon name="check" />
    </button>
  {/snippet}

  <!-- Mounted only while open so the URL field refocuses on each open. -->
  {#if open}
    <LinkForm bind:text bind:href {canSubmit} oncancel={() => (open = false)} onsubmit={submit} />
  {/if}
</Modal>
