<script lang="ts">
  import { page } from '$app/state'
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormError from '$lib/forms/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import AuthField from '../AuthField.svelte'
  import { resetPassword } from './reset-password.remote'

  // Supabase surfaces an expired/invalid recovery link via this query param.
  const linkError = $derived(page.url.searchParams.get('error_description'))
</script>

<svelte:head>
  <title>{m.auth_resetTitle()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if resetPassword.result?.success}
  <div class="card preset-tonal-success px-4 py-6 text-center text-sm" role="status">
    <p class="font-bold">{m.auth_passwordUpdated()}</p>
    <p class="text-surface-600-400 mt-1">{m.auth_passwordUpdatedBody()}</p>
    <a href={resolve('/auth/signin')} class="text-primary-400 mt-3 inline-block font-bold">{m.auth_goToSignIn()}</a>
  </div>
{:else if linkError != null}
  <div class="card preset-tonal-error px-4 py-6 text-center text-sm" role="alert">
    <p class="font-bold">{m.auth_resetLinkInvalid()}</p>
    <p class="text-surface-600-400 mt-1">{linkError}</p>
    <a href={resolve('/auth/forgot-password')} class="text-primary-400 mt-3 inline-block font-bold">
      {m.auth_sendResetLink()}
    </a>
  </div>
{:else}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_resetTitle()}</h1>
  <p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">{m.auth_resetSubtitle()}</p>

  <form {...resetPassword} class="flex flex-col gap-4">
    <FormError form={resetPassword} />

    <AuthField
      field={resetPassword.fields.password}
      label={m.auth_newPassword()}
      type="password"
      placeholder={m.auth_passwordPlaceholderNew()}
      autocomplete="new-password"
      enterkeyhint="next"
      autofocus
    />

    <AuthField
      field={resetPassword.fields.confirmPassword}
      label={m.auth_confirmPassword()}
      type="password"
      placeholder={m.auth_confirmPasswordPlaceholder()}
      autocomplete="new-password"
      enterkeyhint="go"
    />

    <button
      type="submit"
      class="btn preset-filled-primary-500 mt-1 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)] disabled:opacity-60"
      disabled={resetPassword.pending > 0}
    >
      {m.auth_savePassword()}
    </button>
  </form>
{/if}
