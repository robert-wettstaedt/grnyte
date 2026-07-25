<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { updateUsername } from '$lib/entities/user/users.remote'
  import AuthField from '$lib/forms/AuthField.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'

  const global = getGlobalState()

  // Seeded once at init (the app shell gates rendering until the user has loaded), so a failed
  // submit keeps what was typed instead of snapping back to the stored name.
  updateUsername.fields.set({ username: global.user?.username ?? '' })

  const goBack = () => back(resolve('/settings'))

  const onSubmitted = () => {
    toaster.create({ title: m.settings_usernameUpdated(), type: 'success' })
    goBack()
  }
</script>

<svelte:head>
  <title>{m.settings_changeUsername()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  form={updateUsername}
  onCancel={goBack}
  {onSubmitted}
  submitLabel={m.common_save()}
  title={m.settings_changeUsername()}
>
  <AuthField
    field={updateUsername.fields.username}
    label={m.auth_username()}
    type="text"
    placeholder={m.auth_usernamePlaceholder()}
    autocomplete="nickname"
    autocapitalize="none"
    enterkeyhint="done"
    autofocus
  />
</Form>
