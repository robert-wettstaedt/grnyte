<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormError from '$lib/forms/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import AuthField from '../AuthField.svelte'
  import { forgotPassword } from './forgot-password.remote'
</script>

<svelte:head>
  <title>{m.auth_forgotTitle()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if forgotPassword.result?.success}
  <div class="card preset-tonal-success px-4 py-6 text-center text-sm" role="status">
    <p class="font-bold">{m.auth_resetLinkSent()}</p>
    <p class="text-surface-600-400 mt-1">{m.auth_resetLinkSentBody({ email: forgotPassword.result.email })}</p>
    <a href={resolve('/auth/signin')} class="text-primary-400 mt-3 inline-block font-bold">{m.auth_backToSignIn()}</a>
  </div>
{:else}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_forgotTitle()}</h1>
  <p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">{m.auth_forgotSubtitle()}</p>

  <form {...forgotPassword} class="flex flex-col gap-4">
    <FormError form={forgotPassword} />

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
      {m.auth_sendResetLink()}
    </button>
  </form>

  <p class="text-surface-600-400 mt-6 text-center text-[13.5px]">
    <a href={resolve('/auth/signin')} class="text-primary-400 font-bold">{m.auth_backToSignIn()}</a>
  </p>
{/if}
