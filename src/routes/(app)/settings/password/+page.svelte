<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { toaster } from '$lib/state/toast'
  import { updatePasswordCommand } from '../account.remote'
  import { updatePasswordSchema } from '../schemas'

  // A store per visit, so no password typed on an earlier one is still there.
  const store = createFormStore(updatePasswordSchema)
  const submit = (values: z.input<typeof updatePasswordSchema>) => submitCommand(() => updatePasswordCommand(values))

  const onSubmitted = () => {
    toaster.create({ title: m.auth_passwordUpdated(), type: 'success' })
  }
</script>

<svelte:head>
  <title>{m.settings_changePassword()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  {store}
  {submit}
  cancelTo={resolve('/settings')}
  {onSubmitted}
  submitLabel={m.common_save()}
  title={m.settings_changePassword()}
>
  <!-- The current password is what stops a stolen session from taking the account over for good. -->
  <AuthField
    field={store.fields.currentPassword}
    label={m.settings_currentPassword()}
    type="password"
    placeholder={m.auth_passwordPlaceholder()}
    autocomplete="current-password"
    enterkeyhint="next"
    autofocus
  />

  <AuthField
    field={store.fields.password}
    label={m.auth_newPassword()}
    type="password"
    placeholder={m.auth_passwordPlaceholderNew()}
    autocomplete="new-password"
    enterkeyhint="next"
  />

  <AuthField
    field={store.fields.confirmPassword}
    label={m.auth_confirmPassword()}
    type="password"
    placeholder={m.auth_confirmPasswordPlaceholder()}
    autocomplete="new-password"
    enterkeyhint="go"
  />
</Form>
