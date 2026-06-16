<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'
  import LinkForm from './LinkForm.svelte'

  interface Props {
    /** Whether a link mark is active at the current selection (button highlight). */
    active?: boolean
    /** Read the live editor selection to seed the form each time it opens. */
    getInitial: () => { text: string; href: string }
    /** Confirmed: insert/update the link. */
    onsubmit: (value: { text: string; href: string }) => void
  }

  let { active = false, getInitial, onsubmit }: Props = $props()

  // The submit affordance lives in the mobile sheet header (outside the form), so
  // the form values are held here and shared with both it and the footer button.
  let open = $state(false)
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
    onsubmit({ text: text.trim(), href: href.trim() })
  }
</script>

<Modal bind:open title={m.editor_linkTitle()}>
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
