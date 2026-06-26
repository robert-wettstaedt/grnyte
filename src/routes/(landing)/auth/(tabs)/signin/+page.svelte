<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_DEMO_MODE } from '$env/static/public'
  import FormError from '$lib/forms/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import AuthField from '../../AuthField.svelte'
  import { signIn } from './signin.remote'

  // Prefill demo credentials so the demo deploy logs in with one click.
  if (PUBLIC_DEMO_MODE) {
    signIn.fields.set({ email: 'demo@demo.com', password: 'demo' })
  }
</script>

<svelte:head>
  <title>{m.auth_signIn()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_signInTitle()}</h1>
<p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">{m.auth_signInSubtitle()}</p>

<form {...signIn} class="flex flex-col gap-4">
  <FormError form={signIn} />

  <AuthField
    field={signIn.fields.email}
    label={m.auth_email()}
    type="email"
    placeholder="you@example.com"
    autocomplete="username"
    autocapitalize="none"
    enterkeyhint="next"
    autofocus
  />

  <AuthField
    field={signIn.fields.password}
    label={m.auth_password()}
    type="password"
    placeholder={m.auth_passwordPlaceholder()}
    autocomplete="current-password"
    enterkeyhint="go"
  >
    {#snippet action()}
      <a href={resolve('/auth/forgot-password')} class="text-primary-400 text-[12.5px] font-semibold">
        {m.auth_forgot()}
      </a>
    {/snippet}
  </AuthField>

  <button
    type="submit"
    class="btn preset-filled-primary-500 mt-1 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)] disabled:opacity-60"
    disabled={signIn.pending > 0}
  >
    {m.auth_signIn()}
  </button>
</form>

<p class="text-surface-600-400 mt-6 text-center text-[13.5px]">
  {m.auth_noAccount()}
  <a href={resolve('/auth/signup')} class="text-primary-400 font-bold">{m.auth_signUp()}</a>
</p>
