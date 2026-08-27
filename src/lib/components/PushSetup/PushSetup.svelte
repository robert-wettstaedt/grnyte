<!--
  The ask, and the four states it can be in.

  The soft pre-prompt exists because the native one is unrecoverable: `requestPermission()` fires
  once per origin, a decline is permanent, and no amount of app UI can reopen it. So our own
  dismissible card asks first, and only its button triggers the real prompt, which is also the
  only shape that works everywhere (iOS Safari silently ignores a request outside a click handler,
  Firefox requires a gesture, and Chrome downranks origins that ask badly).

  One dismissal flag across every surface that shows this, so somebody is asked once in total.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import InstallApp from '$lib/components/InstallApp/InstallApp.svelte'
  import { m } from '$lib/paraglide/messages'
  import { installPromoMode } from '$lib/state/install.svelte'
  import { dismissPushPrompt, enablePush, promptDismissed, pushState } from '$lib/state/push.svelte'
  import { notifyError } from '$lib/state/toast'

  interface Props {
    /** Whether the card may retire itself once dismissed. A surface somebody navigated to on
     *  purpose (settings) always shows the state; a banner does not nag. */
    dismissible?: boolean
  }

  const { dismissible = false }: Props = $props()

  let busy = $state(false)

  const status = $derived(pushState())

  // Whether installing would actually change the answer. On a touch device with no Push API this
  // is the iOS case and the install IS the fix; on a desktop browser that cannot do push, telling
  // somebody to add the app to their Home Screen is simply wrong.
  const installable = $derived(installPromoMode({ permanent: true }) !== 'none')
  // `denied` is in here too. The native prompt is one shot, so a declined permission is permanent
  // - which would otherwise pin an unremovable "notifications are blocked" card to the top of the
  // inbox forever, on a screen the reader opened to read something else. Settings still shows it,
  // because that is where somebody goes looking for exactly that answer.
  const hidden = $derived(
    dismissible && (promptDismissed() || status === 'granted' || status === 'unsupported' || status === 'denied'),
  )

  const onEnable = async () => {
    busy = true
    try {
      const result = await enablePush()
      if (result === 'denied') {
        // Nothing to toast: the card re-renders into the denied state, which explains itself.
        return
      }
    } catch (cause) {
      notifyError(cause)
    } finally {
      busy = false
    }
  }
</script>

{#if !hidden}
  {#if status === 'unsupported'}
    <!-- Two very different reasons land here, and they need opposite copy. A touch device with no
         Push API is the platform where push only exists once the app is installed, so the install
         is the fix; a desktop browser that cannot do push would not be helped by installing, and
         saying so plainly beats sending somebody to a Home Screen they do not have. -->
    <!-- Dashed, on every branch: this card is an offer, and it sits at the top of two lists whose
         items are solid-bordered cards of the same size. Solid would read as the newest of them. -->
    <div class="border-surface-300-700 space-y-3 rounded-2xl border border-dashed p-4">
      {#if installable}
        <p class="text-surface-600-400 text-sm">{m.push_installFirst()}</p>
        <InstallApp permanent />
      {:else}
        <p class="text-surface-600-400 text-sm">{m.push_unsupported()}</p>
      {/if}
    </div>
  {:else if status === 'denied'}
    <div class="border-surface-300-700 space-y-1 rounded-2xl border border-dashed p-4">
      <p class="text-surface-950-50 font-semibold">{m.push_deniedTitle()}</p>
      <p class="text-surface-600-400 text-sm">{m.push_deniedBody()}</p>
    </div>
  {:else if status === 'prompt'}
    <div class="border-surface-300-700 space-y-3 rounded-2xl border border-dashed p-4">
      <div class="flex items-start gap-3">
        <span class="preset-tonal-primary grid size-10 flex-none place-items-center rounded-xl">
          <Icon name="bell" size={20} />
        </span>

        <div class="min-w-0 flex-1">
          <p class="text-surface-950-50 font-semibold">{m.push_promptTitle()}</p>
          <p class="text-surface-600-400 text-sm">{m.push_promptBody()}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn preset-filled-primary-500" disabled={busy} onclick={onEnable}>
          {m.push_enable()}
        </button>

        {#if dismissible}
          <button type="button" class="btn preset-tonal-surface" onclick={dismissPushPrompt}>
            {m.push_dismiss()}
          </button>
        {/if}
      </div>
    </div>
  {/if}
{/if}
