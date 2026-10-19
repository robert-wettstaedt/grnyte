<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back } from '$lib/state/navigation.svelte'
  import { updateEmailCommand } from '../account.remote'
  import { updateEmailSchema } from '../schemas'

  const store = createFormStore(updateEmailSchema)
  let sentTo = $state<string>()

  const submit = async (values: { email: string }) => {
    sentTo = (await submitCommand(() => updateEmailCommand(values))).email
  }

  const currentEmail = $derived(page.data.session?.user.email)

  const goBack = () => back(resolve('/settings'))
</script>

<svelte:head>
  <title>{m.settings_changeEmail()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if sentTo != null}
  <!-- The change is pending until both inboxes confirm, so the account keeps its old address for
       now and there is nothing to go back to but the settings list. -->
  <div class="mx-auto max-w-screen-sm px-4 py-8">
    <div class="card preset-tonal-success px-4 py-6 text-center text-sm" role="status">
      <p class="font-bold">{m.settings_emailChangeSent()}</p>
      <p class="text-surface-600-400 mt-1">{m.settings_emailChangeSentBody({ email: sentTo })}</p>
      <button type="button" class="text-primary-400 mt-3 font-bold" onclick={goBack}>{m.common_back()}</button>
    </div>
  </div>
{:else}
  <Form
    stayOnSubmit
    {store}
    {submit}
    cancelTo={resolve('/settings')}
    submitLabel={m.common_save()}
    title={m.settings_changeEmail()}
  >
    <AuthField
      field={store.fields.email}
      label={m.settings_emailNew()}
      type="email"
      placeholder={currentEmail ?? 'you@example.com'}
      autocomplete="email"
      autocapitalize="none"
      enterkeyhint="go"
      autofocus
    />

    <p class="text-surface-600-400 text-sm">{m.settings_emailChangeHint()}</p>
  </Form>
{/if}
