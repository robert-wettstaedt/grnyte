<script lang="ts">
  import { setNewPassword } from '$lib/auth/password.remote'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import FormError from '$lib/forms/FormError.svelte'
  import { passwordSchema } from '$lib/forms/schemas'
  import { createFormStore } from '$lib/forms/store.svelte'
  import * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'

  // The new password after a code proved the inbox: a reset, or a contested sign-up.
  const { ondone }: { ondone: () => Promise<void> | void } = $props()

  const store = createFormStore(z.object({ password: passwordSchema }))
  let shown = $state(false)
  let pending = $state(false)

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    pending = true
    try {
      const outcome = await store.submit((values) => submitCommand(() => setNewPassword(values)))
      if (outcome.kind === 'done') await ondone()
    } finally {
      pending = false
    }
  }
</script>

<form class="flex flex-col gap-4" oninput={store.capture} {onsubmit} novalidate>
  <FormError form={store} />
  <AuthField
    field={store.fields.password}
    label={m.auth_newPassword()}
    type={shown ? 'text' : 'password'}
    placeholder={m.auth_passwordPlaceholderNew()}
    autocomplete="new-password"
    enterkeyhint="go"
    autofocus
  >
    {#snippet action()}
      <button
        type="button"
        class="text-primary-600-400 -mx-1 flex min-h-6 items-center px-1 text-[12.5px] font-semibold"
        aria-pressed={shown}
        onclick={() => (shown = !shown)}
      >
        {shown ? m.auth_passwordHide() : m.auth_passwordShow()}
      </button>
    {/snippet}
  </AuthField>
  <button type="submit" class="btn preset-filled-primary-500 h-12.5 w-full font-semibold" disabled={pending}>
    {#if pending}
      <LoadingIndicator size="18px" />
    {/if}
    {m.auth_savePassword()}
  </button>
</form>
