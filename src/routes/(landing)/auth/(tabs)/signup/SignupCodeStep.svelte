<script lang="ts">
  import MailedCodeStep from '$lib/auth/MailedCodeStep.svelte'
  import HiddenBotForm from '$lib/forms/HiddenBotForm.svelte'
  import { m } from '$lib/paraglide/messages'
  import { confirmSignupCode, resendSignupCode } from './signup.remote'

  // The confirmation code step of sign-up and of an unconfirmed sign-in. The token lives only in
  // this page, so a reload drops it and the next resend flags the account.
  interface Props {
    email: string
    next: null | string
    resendToken: string
  }

  const { email, next, resendToken }: Props = $props()

  let resendForm: HiddenBotForm | undefined = $state()
</script>

<h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.auth_codeTitle()}</h1>
<MailedCodeStep
  {email}
  {next}
  confirm={(code) => confirmSignupCode({ code, email })}
  resend={() => resendForm?.send() ?? Promise.resolve()}
/>
<HiddenBotForm bind:this={resendForm} form={resendSignupCode} values={{ email, resendToken }} />
