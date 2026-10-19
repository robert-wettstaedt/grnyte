<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { updateUsernameSchema } from '$lib/entities/user/dto'
  import { updateUsername } from '$lib/entities/user/writes'
  import AuthField from '$lib/forms/AuthField.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { toaster } from '$lib/state/toast'

  const global = getGlobalState()
  const store = createFormStore(updateUsernameSchema)

  // Seeded once as the page opens (the app shell gates rendering until the user has loaded), so a failed
  // submit keeps what was typed instead of snapping back to the stored name.
  const initial = { username: global.user?.username ?? '' }

  const onSubmitted = () => {
    toaster.create({ title: m.settings_usernameUpdated(), type: 'success' })
  }
</script>

<svelte:head>
  <title>{m.settings_changeUsername()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  {initial}
  {store}
  submit={updateUsername}
  cancelTo={resolve('/settings')}
  {onSubmitted}
  submitLabel={m.common_save()}
  title={m.settings_changeUsername()}
>
  <AuthField
    field={store.fields.username}
    label={m.auth_username()}
    type="text"
    placeholder={m.auth_usernamePlaceholder()}
    autocomplete="nickname"
    autocapitalize="none"
    enterkeyhint="done"
    autofocus
  />
</Form>
