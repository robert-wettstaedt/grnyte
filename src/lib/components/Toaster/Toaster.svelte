<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { toaster } from '$lib/state/toast'
  import { Toast } from '@skeletonlabs/skeleton-svelte'
</script>

<Toast.Group {toaster} class="z-100">
  {#snippet children(toast)}
    <!-- Inverse surface (light pill on the dark UI) so the snackbar reads as floating
         above the sheet rather than blending into it. -->
    <Toast
      {toast}
      class="card bg-surface-900-100 text-surface-100-900 mx-auto flex w-full max-w-sm items-center gap-3 py-2 pr-2 pl-4 shadow-2xl shadow-black/50"
    >
      <Toast.Title class="min-w-0 flex-1 truncate text-sm font-semibold">{toast.title}</Toast.Title>

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
