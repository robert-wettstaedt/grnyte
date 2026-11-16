<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import MailedCodeStep from '$lib/auth/MailedCodeStep.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import BotCheck from '$lib/forms/BotCheck.svelte'
  import FormError from '$lib/forms/FormError.svelte'
  import HiddenBotForm from '$lib/forms/HiddenBotForm.svelte'
  import { m } from '$lib/paraglide/messages'
  import { confirmResetCode, forgotPassword } from './forgot-password.remote'

  // Set when a contested sign-up's password could not be replaced; the address comes along.
  const contested = $derived(page.url.searchParams.has('contested'))
  const prefilled = page.url.searchParams.get('email')
  if (prefilled != null) forgotPassword.fields.set({ email: prefilled })

  let resendForm: HiddenBotForm | undefined = $state()
</script>

<svelte:head>
  <title>{m.auth_forgotTitle()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if forgotPassword.result?.success}
  {@const email = forgotPassword.result.email}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_codeTitle()}</h1>
  <MailedCodeStep
    {email}
    confirm={(code) => confirmResetCode({ code, email })}
    resend={() => resendForm?.send() ?? Promise.resolve()}
  />
  <HiddenBotForm bind:this={resendForm} form={forgotPassword} values={{ email }} />
{:else}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_forgotTitle()}</h1>
  <p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">
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

  <p class="text-surface-600-400 mt-6 text-center text-[13.5px]">
    <a href={resolve('/auth/signin')} class="text-primary-400 font-bold">{m.auth_backToSignIn()}</a>
  </p>
{/if}
