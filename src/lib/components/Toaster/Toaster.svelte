<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { toaster } from '$lib/state/toast'
  import { Toast } from '@skeletonlabs/skeleton-svelte'

  // Only a verdict gets a mark: a check when the write landed, a triangle when it did not.
  // `info` toasts are the undo snackbars, which prompt rather than report, so they stay plain
  // text and leave the Undo button as the only thing competing with the copy.
  //
  // The shades run the other way round than elsewhere because the pill is an inverse surface:
  // the bright tint sits on the dark (light mode) pill, the deep one on the light pill. Only
  // Skeleton's symmetric pairings (300-700, 400-600, …) exist as classes; an unbalanced pair
  // silently generates nothing and the icon falls back to the title's colour.
  const marks = {
    error: { class: 'text-error-300-700', icon: 'alert-triangle' },
    success: { class: 'text-success-300-700', icon: 'check' },
    warning: { class: 'text-warning-300-700', icon: 'alert-triangle' },
  } as const
</script>

<Toast.Group {toaster} class="z-100">
  {#snippet children(toast)}
    {@const mark = marks[toast.type as keyof typeof marks]}

    <!-- Inverse surface (light pill on the dark UI) so the snackbar reads as floating
         above the sheet rather than blending into it. -->
    <Toast
      {toast}
      class="card bg-surface-900-100 text-surface-100-900 mx-auto flex w-full max-w-sm items-center gap-3 py-2 pr-2 pl-4 shadow-2xl shadow-black/50"
    >
      {#if mark}
        <!-- Shape as well as colour, so success and failure are not told apart by hue alone. -->
        <Icon name={mark.icon} size={18} class="{mark.class} flex-none" />
      {/if}

      <!-- Wraps rather than truncates: every title here names the address or region it acted on,
           which is the part an ellipsis eats first. -->
      <Toast.Title class="min-w-0 flex-1 text-sm font-semibold wrap-break-word">{toast.title}</Toast.Title>

      {#if toast.action}
        <Toast.ActionTrigger class="btn btn-sm preset-filled-primary-500 flex-none font-semibold">
          {toast.action.label}
        </Toast.ActionTrigger>

        <!-- Dead-zone between the action and dismiss so a mis-tap can't swap them. -->
        <div class="bg-surface-400-600 h-6 w-px flex-none" aria-hidden="true"></div>
      {/if}

      <Toast.CloseTrigger class="btn-icon btn-icon-sm hover:preset-tonal flex-none" aria-label={m.common_close()}>
        <Icon name="close" size={16} />
      </Toast.CloseTrigger>
    </Toast>
  {/snippet}
</Toast.Group>
