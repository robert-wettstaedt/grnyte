<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { appleConfirmation } from '$lib/auth/appleConfirmation.svelte'
  import ReauthStep, { withReauth } from '$lib/auth/ReauthStep.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { toaster } from '$lib/state/toast'
  import { slide } from 'svelte/transition'
  import { updatePasswordCommand } from '../account.remote'
  import { updatePasswordSchema } from '../schemas'

  // A store per visit, so no password typed on an earlier one is still there.
  const store = createFormStore(updatePasswordSchema)
  let confirmed = $state(false)
  let step: ReauthStep | undefined = $state()
  const apple = appleConfirmation()
  // A social-only account sets its first password here.
  const title = $derived(apple.hasPassword === false ? m.settings_setPassword() : m.settings_changePassword())

  const submit = async (values: z.input<typeof updatePasswordSchema>) => {
    const result = await withReauth(step, () => submitCommand(() => updatePasswordCommand(values)))
    // The change ended this device's session: adopt the new one before Zero's next write.
    await page.data.supabase?.auth.setSession(result.session)
    await invalidate('supabase:auth')
    return result
  }

  const onSubmitted = () => {
    toaster.create({ title: m.auth_passwordUpdated(), type: 'success' })
  }
</script>

<svelte:head>
  <title>{title} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  {store}
  {submit}
  cancelTo={resolve('/settings')}
  {onSubmitted}
  submitDisabled={!confirmed}
  submitLabel={m.common_save()}
  {title}
>
  <p class="text-surface-600-400 text-[14.5px] leading-normal">{m.settings_passwordIntro()}</p>

  <!-- A confirmed code, not the current password, stops a stolen session from taking the account. -->
  <ReauthStep
    bind:this={step}
    bind:confirmed
    action="password.change"
    email={page.data.session?.user.email ?? ''}
    target="self"
  />

  {#if confirmed}
    <div transition:slide={{ duration: motion(150) }}>
      <AuthField
        field={store.fields.password}
        label={m.auth_newPassword()}
        type="password"
        reveal
        hint={m.auth_passwordHint()}
        autocomplete="new-password"
        enterkeyhint="go"
        autofocus
      />
    </div>
  {/if}
</Form>
