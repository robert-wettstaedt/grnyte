<script lang="ts">
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import type { StoreField } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { notifyError, toaster } from '$lib/state/toast'
  import type { HTMLInputAttributes } from 'svelte/elements'
  import { sendPasswordReset } from './session.remote'

  interface Props {
    autofocus?: boolean
    enterkeyhint: HTMLInputAttributes['enterkeyhint']
    field: StoreField<string>
  }

  const { autofocus = false, enterkeyhint, field }: Props = $props()

  let pending = $state(false)

  const send = async () => {
    if (pending) return
    pending = true
    try {
      const { email } = await submitCommand(() => sendPasswordReset())
      toaster.create({ title: m.auth_resetLinkSentBody({ email }), type: 'success' })
    } catch (cause) {
      notifyError(cause)
    } finally {
      pending = false
    }
  }
</script>

<AuthField
  {field}
  label={m.settings_currentPassword()}
  type="password"
  placeholder={m.auth_passwordPlaceholder()}
  autocomplete="current-password"
  {enterkeyhint}
  {autofocus}
>
  {#snippet action()}
    <button
      type="button"
      class="text-primary-600-400 -mx-1 flex min-h-6 items-center px-1 text-[12.5px] font-semibold aria-disabled:opacity-60"
      aria-label={m.auth_forgotSendLink()}
      aria-disabled={pending}
      onclick={send}
    >
      {m.auth_forgot()}
    </button>
  {/snippet}
</AuthField>
