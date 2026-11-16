<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ProviderBlock from '$lib/auth/ProviderBlock.svelte'
  import TermsAgree from '$lib/auth/TermsAgree.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import BotCheck from '$lib/forms/BotCheck.svelte'
  import FormError from '$lib/forms/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { fade } from 'svelte/transition'
  import { signUp } from './signup.remote'
  import SignupCodeStep from './SignupCodeStep.svelte'

  // An invitation is keyed on the address, so signing up with a different one silently orphans it.
  // The accept screen sends `?email=` for exactly this.
  const invited = page.url.searchParams.get('email')
  if (invited != null) {
    signUp.fields.set({ email: invited })
  }

  // A bare sign-in link would land on the installed app's welcome fork, not the form.
  const signInSearch = $derived(page.url.search || '?form=signin')

  // The result outlives the step on the form's singleton, so "Go back" remembers which one it left.
  let left = $state<unknown>()
  const sent = $derived(signUp.result?.success && signUp.result !== left ? signUp.result : undefined)
</script>

<svelte:head>
  <title>{m.auth_createAccount()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if sent != null}
  <div in:fade={{ duration: motion(150) }}>
    <SignupCodeStep
      email={sent.email}
      next={page.url.searchParams.get('next')}
      resendToken={sent.resendToken}
      title={m.auth_codeTitle()}
      subtitle={m.auth_codeSentTo({ email: sent.email })}
      onback={() => {
        left = sent
        signUp.fields.set({ email: sent.email })
      }}
    />
  </div>
{:else}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_createAccount()}</h1>
  <p class="text-surface-600-400 mb-5.5 text-[14.5px] leading-snug">
    {m.auth_signUpSubtitle()}
  </p>
  <ProviderBlock />

  <form {...signUp} class="flex flex-col gap-4">
    <FormError form={signUp} />
    <BotCheck fields={signUp.fields} />

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
      field={signUp.fields.password}
      label={m.auth_password()}
      type="password"
      reveal
      placeholder={m.auth_passwordPlaceholderNew()}
      hint={m.auth_passwordHint()}
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

  <p class="text-surface-600-400 mt-5.5 text-center text-[13.5px]">
    {m.auth_haveAccount()}
    <!-- resolve()'d path plus a query string, which resolve() itself does not take -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href={resolve('/auth/signin') + signInSearch} class="text-primary-600-400 font-bold">{m.auth_signIn()}</a>
  </p>
  <TermsAgree />
{/if}
