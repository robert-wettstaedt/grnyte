<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_DEMO_MODE } from '$env/static/public'
  import AuthField from '$lib/forms/AuthField.svelte'
  import FormError from '$lib/forms/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import { signIn } from './signin.remote'

  // The invited address, when the accept screen sent them here. The invitation is keyed on it, so
  // signing in as somebody else lands them back on the wrong-account state.
  const invited = page.url.searchParams.get('email')

  // Where to go after signing in, carried in from whatever sent them here (the invitation accept
  // screen). Without it an invitee lands on /explore and has to dig the link out of their inbox
  // again. Validated server-side, see `signIn`.
  const next = $derived(page.url.searchParams.get('next'))

  // Prefill demo credentials so the demo deploy logs in with one click.
  if (PUBLIC_DEMO_MODE === 'true' || PUBLIC_DEMO_MODE === '1') {
    signIn.fields.set({ email: 'demo@demo.com', password: 'demo' })
  } else if (invited != null) {
    signIn.fields.set({ email: invited })
  }
</script>

<svelte:head>
  <title>{m.auth_signIn()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_signInTitle()}</h1>
<p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">{m.auth_signInSubtitle()}</p>

<form {...signIn} class="flex flex-col gap-4">
  <FormError form={signIn} />

  {#if next != null}
    <input type="hidden" name="next" value={next} />
  {/if}

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
  <!-- resolve()'d path plus a query string, which resolve() itself does not take -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a href={resolve('/auth/signup') + page.url.search} class="text-primary-400 font-bold">{m.auth_signUp()}</a>
</p>
