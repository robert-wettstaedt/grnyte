<!--
  Edit the origin URL credited on a video. The URL is asked for at upload (MediaDropZone's
  video step); this is the same field on the other side of it, so a typo or a credit added
  later is fixable. Only route videos ask for a source, so the viewer only mounts this for
  those (see MediaViewer).
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { setVideoSource } from '$lib/entities/file/files.remote'
  import { isValidSource, normalizeSource } from '$lib/entities/file/upload'
  import { m } from '$lib/paraglide/messages'
  import { notifyError } from '$lib/state/toast'
  import SourceField from './SourceField.svelte'

  interface Props {
    file: MediaFile
    /** Bindable so the host can pause its own shortcuts while the sheet is up. */
    open?: boolean
  }

  let { file, open = $bindable(false) }: Props = $props()

  // Seeded on open rather than derived from `file`: the viewer swaps `file` underneath
  // us as the deck pages, which would wipe whatever is half-typed.
  let raw = $state('')
  let saving = $state(false)

  const normalized = $derived(normalizeSource(raw))
  const valid = $derived(isValidSource(normalized))

  const save = async () => {
    if (saving || !valid) {
      return
    }
    saving = true
    try {
      await setVideoSource({ fileId: file.id, source: normalized ?? null })
      open = false
    } catch {
      notifyError()
    } finally {
      saving = false
    }
  }
</script>

{#snippet footer()}
  <button type="button" class="btn btn-sm preset-filled-primary-500" disabled={saving || !valid} onclick={save}>
    {m.common_save()}
  </button>
{/snippet}

<Modal backdrop bind:open contentClass="w-80" {footer} panel={false} snapPoints={[0.5]} title={m.media_editSource()}>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'btn preset-glass-neutral btn-lg h-12 w-12 px-0']}
      aria-label={m.media_editSource()}
      onclick={() => {
        raw = file.source ?? ''
        open = !open
      }}
    >
      <Icon name="link" size={19} />
    </button>
  {/snippet}

  <SourceField bind:value={raw} {valid} />
</Modal>
