<script lang="ts">
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import { m } from '$lib/paraglide/messages'
  import { askedCount, question } from '$lib/state/pwa/leave.svelte'

  // Every sign-out on the device asks here first when writes queued offline would be deleted with it.
  const asking = $derived(question())
</script>

<Dialog
  destructive
  open={asking != null}
  onOpenChange={({ open }) => {
    // Closed any other way than the main action: the person waits.
    if (!open) asking?.answer(false)
  }}
  onsave={() => asking?.answer(true)}
  saveText={m.settings_signOutAnyway()}
  title={m.settings_signOutQueuedTitle()}
>
  {#snippet content()}
    {m.settings_signOutQueued({ count: askedCount() })}
  {/snippet}
</Dialog>
