<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AuthField from '$lib/forms/AuthField.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'
  import { updatePassword } from '../account.remote'

  // The form's fields live on the module-level remote singleton, so they survive navigation for
  // the whole session. Clear them on every visit: nobody wants to find their old password still
  // typed in, least of all after the change already went through.
  updatePassword.fields.set({ confirmPassword: '', currentPassword: '', password: '' })

  const goBack = () => back(resolve('/settings'))

  const onSubmitted = () => {
    toaster.create({ title: m.auth_passwordUpdated(), type: 'success' })
    goBack()
  }
</script>

<svelte:head>
  <title>{m.settings_changePassword()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  form={updatePassword}
  onCancel={goBack}
  {onSubmitted}
  submitLabel={m.auth_savePassword()}
  title={m.settings_changePassword()}
>
  <!-- The current password is what stops a stolen session from taking the account over for good. -->
  <AuthField
    field={updatePassword.fields.currentPassword}
    label={m.settings_currentPassword()}
    type="password"
    placeholder={m.auth_passwordPlaceholder()}
    autocomplete="current-password"
    enterkeyhint="next"
    autofocus
  />

  <AuthField
    field={updatePassword.fields.password}
    label={m.auth_newPassword()}
    type="password"
    placeholder={m.auth_passwordPlaceholderNew()}
    autocomplete="new-password"
    enterkeyhint="next"
  />

  <AuthField
    field={updatePassword.fields.confirmPassword}
    label={m.auth_confirmPassword()}
    type="password"
    placeholder={m.auth_confirmPasswordPlaceholder()}
    autocomplete="new-password"
    enterkeyhint="go"
  />
</Form>
