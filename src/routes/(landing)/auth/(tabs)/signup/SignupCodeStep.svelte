<script lang="ts">
  import MailedCodeStep from '$lib/auth/MailedCodeStep.svelte'
  import HiddenBotForm from '$lib/forms/HiddenBotForm.svelte'
  import { confirmSignupCode, resendSignupCode } from './signup.remote'

  // The confirmation code step of sign-up and of an unconfirmed sign-in. The token lives only in
  // this page, so a reload drops it and the next resend flags the account.
  interface Props {
    email: string
    next: null | string
    onback: () => void
    resendToken: string
    subtitle: string
    title: string
  }

  const { email, next, onback, resendToken, subtitle, title }: Props = $props()

  let resendForm: HiddenBotForm | undefined = $state()
</script>

<MailedCodeStep
  {email}
  {next}
  {onback}
  {subtitle}
  {title}
  confirm={(code) => confirmSignupCode({ code, email })}
  resend={() => resendForm?.send() ?? Promise.resolve()}
/>
<HiddenBotForm bind:this={resendForm} form={resendSignupCode} values={{ email, resendToken }} />
