<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import MailedCodeStep from '$lib/auth/codes/MailedCodeStep.svelte'
  import BotCheck from '$lib/forms/bot/BotCheck.svelte'
  import HiddenBotForm from '$lib/forms/bot/HiddenBotForm.svelte'
  import AuthField from '$lib/forms/fields/AuthField.svelte'
  import FormError from '$lib/forms/fields/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { fade } from 'svelte/transition'
  import { confirmResetCode, forgotPassword } from './forgot-password.remote'

  // Set when a contested sign-up's password could not be replaced; the address comes along.
  const contested = $derived(page.url.searchParams.has('contested'))
  const prefilled = page.url.searchParams.get('email')
  if (prefilled != null) forgotPassword.fields.set({ email: prefilled })

  let resendForm: HiddenBotForm | undefined = $state()
  let choosing = $state(false)
  // The result outlives the step on the form's singleton, so "Go back" remembers which one it left.
  let left = $state<unknown>()
  const sent = $derived(
    forgotPassword.result?.success && forgotPassword.result !== left ? forgotPassword.result : undefined,
  )
</script>

<svelte:head>
  <title>{m.auth_forgotTitle()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if sent != null}
  {@const email = sent.email}
  <div in:fade={{ duration: motion(150) }}>
    <MailedCodeStep
      bind:choosing
      {email}
      reset
      title={m.auth_codeTitle()}
      subtitle={m.auth_codeSentToIfAccount({ email })}
      confirm={(code) => confirmResetCode({ code, email })}
      resend={() => resendForm?.send() ?? Promise.resolve()}
      onback={() => {
        left = sent
        forgotPassword.fields.set({ email })
      }}
    />
  </div>
  <HiddenBotForm bind:this={resendForm} form={forgotPassword} values={{ email }} />
{:else}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_forgotTitle()}</h1>
  <p class="text-surface-600-400 mb-5.5 text-[14.5px] leading-snug">
    {contested ? m.auth_forgotContestedSubtitle() : m.auth_forgotCodeSubtitle()}
  </p>

  <form {...forgotPassword} class="flex flex-col gap-4">
    <FormError form={forgotPassword} />
    <BotCheck fields={forgotPassword.fields} />

    <AuthField
      field={forgotPassword.fields.email}
      label={m.auth_email()}
      type="email"
      placeholder="you@example.com"
      autocomplete="username"
      autocapitalize="none"
      enterkeyhint="go"
      autofocus
    />

    <button
      type="submit"
      class="btn preset-filled-primary-500 mt-1 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)] disabled:opacity-60"
      disabled={forgotPassword.pending > 0}
    >
      {m.auth_sendResetCode()}
    </button>
  </form>
{/if}

<!-- On the address and the code; the new password has no way back. -->
{#if !choosing}
  <p class="text-surface-600-400 mt-5.5 text-center text-[13.5px]">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `?form=signin`: the form, never the welcome fork -->
    <a href={resolve('/auth/signin') + '?form=signin'} class="text-primary-600-400 font-bold">
      {m.auth_backToSignIn()}
    </a>
  </p>
{/if}
