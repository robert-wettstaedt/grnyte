<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import { authStepHref } from '$lib/auth'
  import AuthSteps from '$lib/auth/methods/AuthSteps.svelte'
  import TermsAgree from '$lib/auth/methods/TermsAgree.svelte'
  import Banner from '$lib/components/Banner/Banner.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import FormError from '$lib/forms/FormError.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { replaceUrl } from '$lib/state/navigation.svelte'
  import { fade } from 'svelte/transition'
  import SignupCodeStep from '../signup/SignupCodeStep.svelte'
  import { signIn } from './signin.remote'

  // An unconfirmed account's right password: GoTrue mailed a code, this page asks for it.
  let unconfirmed = $state<null | { email: string; resendToken: string }>(null)
  const codeStepOf = (result: undefined | { confirm?: string; resendToken?: string }) =>
    result?.confirm == null ? null : { email: result.confirm, resendToken: result.resendToken ?? '' }

  // The invited address, when the accept screen sent them here. The invitation is keyed on it, so
  // signing in as somebody else lands them back on the wrong-account state.
  const invited = page.url.searchParams.get('email')

  // Where to go after signing in, carried in from whatever sent them here (the invitation accept
  // screen). Without it an invitee lands on /explore and has to dig the link out of their inbox
  // again. Validated server-side, see `signIn`.
  const next = $derived(page.url.searchParams.get('next'))

  if (invited != null) {
    signIn.fields.set({ email: invited })
  }

  // Leaving a step must not leave a typed password behind, and an invited address always shows.
  const onswap = () => signIn.fields.set(invited == null ? {} : { email: invited })

  // `replaceUrl`, so a signed-in reader has no sign-in page behind them to walk back into.
  //
  // Driven by THIS submit and not by `signIn.result`, which is never cleared on navigation: it
  // lives on the module-level singleton and Kit only resets it when a submit throws. An effect
  // watching it re-fired on the next mount and bounced a signed-out reader straight off this page.
  const submitAndLeave = async ({ submit }: { submit: () => Promise<boolean> }) => {
    const succeeded = await submit()
    if (!succeeded) return

    const result = signIn.result
    unconfirmed = codeStepOf(result)
    const destination = result?.redirectTo

    // Kit's own enhance clears the form after a success and supplying ours replaced it. That
    // matters beyond tidiness here: the fields are on that same singleton, so the password would
    // otherwise sit in memory for the rest of the session.
    signIn.fields.set({})

    if (destination != null) {
      await replaceUrl(destination)
    }
  }
</script>

<svelte:head>
  <title>{m.auth_signIn()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if unconfirmed != null}
  {@const { email, resendToken } = unconfirmed}
  <div in:fade={{ duration: motion(150) }}>
    <SignupCodeStep
      {email}
      {next}
      {resendToken}
      title={m.auth_confirmEmailTitle()}
      subtitle={m.auth_codeSentToSignIn({ email })}
      onback={() => {
        signIn.fields.set({ email })
        unconfirmed = null
      }}
    />
  </div>
{:else}
  {#if page.url.search === ''}
    <!-- The installed app's start: CSS alone shows it, so the first paint is already right. -->
    <div class="welcome-fork hidden flex-1 flex-col">
      <div class="flex flex-1 flex-col items-center justify-center gap-3.5 text-center">
        <img src={Logo} alt="" class="block size-19 rounded-[20px]" />
        <strong class="[font-family:var(--heading-font-family)] text-[34px] leading-none font-bold tracking-tight">
          {PUBLIC_APPLICATION_NAME}
        </strong>
        <p class="text-surface-600-400 text-[15.5px]">{m.landing_tagline()}</p>
      </div>
      <div class="flex flex-col gap-2.5">
        <a
          href={resolve('/auth/signup')}
          class="btn preset-filled-primary-500 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)]"
        >
          {m.auth_createAccount()}
        </a>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- resolve()'d path plus a query -->
        <a
          href={resolve('/auth/signin') + '?form=signin'}
          class="btn preset-outlined-surface-300-700 bg-surface-50-950 h-12.5 w-full font-semibold"
        >
          {m.auth_welcomeSignIn()}
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </div>
      <TermsAgree />
    </div>
  {/if}

  <div class="signin-content">
    <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_signIn()}</h1>
    <p class="text-surface-600-400 mb-5.5 text-[14.5px] leading-snug">{m.auth_signInSubtitle()}</p>
    {#if page.url.searchParams.get('deleted') === '1'}
      <Banner class="mb-4.5">{m.auth_accountDeleted()}</Banner>
    {/if}
    <AuthSteps lastUsed={page.data.lastUsed} {onswap} providers={page.data.providers} screen="signin">
      <form {...signIn.enhance(submitAndLeave)} class="flex flex-col gap-4">
        <FormError form={signIn}>
          {#if page.data.providers.length > 0}
            <p class="text-surface-600-400">
              {m.auth_providerHint()}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `authStepHref`: a fixed auth path plus a query -->
              <a href={authStepHref(page.url, '/auth/signin', false)} class="text-primary-600-400 font-bold">
                {m.auth_providerHintBack()}
              </a>
            </p>
          {/if}
        </FormError>
        <input type="hidden" name="codeFlow" value="1" />

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
          reveal
          placeholder={m.auth_passwordPlaceholder()}
          autocomplete="current-password"
          enterkeyhint="go"
        >
          {#snippet action()}
            <a
              href={resolve('/auth/forgot-password')}
              class="text-primary-600-400 -mx-1 flex min-h-6 items-center px-1 text-[12.5px] font-semibold"
            >
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
    </AuthSteps>

    <p class="text-surface-600-400 mt-5.5 text-center text-[13.5px]">
      {m.auth_noAccount({ name: PUBLIC_APPLICATION_NAME })}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `authStepHref`: a fixed auth path plus a query -->
      <a href={authStepHref(page.url, '/auth/signup', false)} class="text-primary-600-400 font-bold">
        {m.auth_createAccount()}
      </a>
    </p>
    <TermsAgree />
  </div>
{/if}

<style>
  @media (display-mode: standalone) {
    .welcome-fork {
      display: flex;
    }
    .welcome-fork + .signin-content {
      display: none;
    }
  }
</style>
