<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'

  // Confirm saving a block that has no location — a real, focus-trapped dialog
  // (bottom-anchored sheet on mobile, centred modal on desktop). Copy defaults to the
  // add flow; the edit flow overrides it with "Save …" wording.
  interface Props {
    open: boolean
    title?: string
    body?: string
    /** Label for the "save without a location" action. */
    confirmLabel?: string
    onPinNow: () => void
    onConfirm: () => void
    /** Dismiss (the secondary "go back" path — also fires on backdrop tap / Escape). */
    onCancel: () => void
  }

  const {
    open,
    title = m.blocks_add_confirmTitle(),
    body = m.blocks_add_confirmBody(),
    confirmLabel = m.blocks_add_addWithoutLocation(),
    onPinNow,
    onConfirm,
    onCancel,
  }: Props = $props()
</script>

<Dialog
  {open}
  onOpenChange={(event) => {
    if (!event.open) onCancel()
  }}
>
  <Portal>
    <Dialog.Backdrop class="bg-surface-950/70 fixed inset-0 z-50 backdrop-blur-sm" />
    <Dialog.Positioner class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <!-- One elevation above the form's surface-100-900 cards (lighter in dark mode) + a
           crisp border, so it reads as a layer on top rather than more of the same content. -->
      <Dialog.Content
        class="bg-surface-200-800 border-surface-300-700 w-full max-w-md rounded-t-3xl border px-5 pt-6 pb-6 shadow-2xl sm:rounded-3xl"
      >
        <div class="flex flex-col items-center text-center">
          <span class="bg-warning-500/15 text-warning-500 mb-3.5 flex size-13 items-center justify-center rounded-2xl">
            <Icon name="alert-triangle" size={25} />
          </span>
          <Dialog.Title class="mb-2 text-lg font-bold tracking-tight">{title}</Dialog.Title>
          <Dialog.Description class="text-surface-600-400 max-w-72 text-sm leading-relaxed">{body}</Dialog.Description>
        </div>
        <div class="mt-5 flex flex-col gap-2.5">
          <button
            class="btn preset-filled-primary-500 h-12 rounded-xl text-base font-bold"
            onclick={onPinNow}
            type="button"
          >
            <Icon name="map-pin" size={18} />
            {m.blocks_add_pinNow()}
          </button>
          <button
            class="btn border-surface-400-600 text-surface-950-50 hover:bg-surface-300-700 h-12 rounded-xl border bg-transparent text-base font-semibold"
            onclick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
