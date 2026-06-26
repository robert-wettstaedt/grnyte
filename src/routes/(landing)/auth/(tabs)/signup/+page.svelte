<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormError from '$lib/forms/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import AuthField from '../../AuthField.svelte'
  import { signUp } from './signup.remote'
</script>

<svelte:head>
  <title>{m.auth_signUp()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if signUp.result?.success}
  <div class="card preset-tonal-success px-4 py-6 text-center text-sm" role="status">
    <p class="font-bold">{m.auth_accountCreated()}</p>
    <p class="text-surface-600-400 mt-1">{m.auth_accountCreatedBody()}</p>
    <a href={resolve('/auth/signin')} class="text-primary-400 mt-3 inline-block font-bold">{m.auth_goToSignIn()}</a>
  </div>
{:else}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_signUpTitle()}</h1>
  <p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">
    {m.auth_signUpSubtitle()}
  </p>

  <form {...signUp} class="flex flex-col gap-4">
    <FormError form={signUp} />

    <AuthField
      field={signUp.fields.email}
      label={m.auth_email()}
      type="email"
      placeholder="you@example.com"
      autocomplete="username"
      autocapitalize="none"
      enterkeyhint="next"
      autofocus
    />
    <AuthField
      field={signUp.fields.username}
      label={m.auth_username()}
      type="text"
      placeholder={m.auth_usernamePlaceholder()}
      autocomplete="nickname"
      autocapitalize="none"
      enterkeyhint="next"
    />
    <AuthField
      field={signUp.fields.password}
      label={m.auth_password()}
      type="password"
      placeholder={m.auth_passwordPlaceholderNew()}
      autocomplete="new-password"
      enterkeyhint="next"
    />
    <AuthField
      field={signUp.fields.confirmPassword}
      label={m.auth_confirmPassword()}
      type="password"
      placeholder={m.auth_confirmPasswordPlaceholder()}
      autocomplete="new-password"
      enterkeyhint="done"
    />

    <button
      type="submit"
      class="btn preset-filled-primary-500 mt-1 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)] disabled:opacity-60"
      disabled={signUp.pending > 0}
    >
      {m.auth_createAccount()}
    </button>
  </form>

  <p class="text-surface-600-400 mt-6 text-center text-[13.5px]">
    {m.auth_haveAccount()}
    <a href={resolve('/auth/signin')} class="text-primary-400 font-bold">{m.auth_signIn()}</a>
  </p>
{/if}
