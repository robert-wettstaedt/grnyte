<script lang="ts">
  import { resolve } from '$app/paths'
  import { signedInRedirectTarget } from '$lib/auth'
  import { createFormStore } from '$lib/forms/store.svelte'
  import * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { fade } from 'svelte/transition'
  import CodeEntry from './CodeEntry.svelte'
  import NewPasswordStep from './NewPasswordStep.svelte'

  // The step after GoTrue mailed an 8-digit code: sign-up, an unconfirmed sign-in, and reset.
  interface Props {
    confirm: (code: string) => Promise<{ next: 'choosePassword' | 'forgotPassword' | 'profile' }>
    email: string
    /** Where to land afterwards; the server's gate opens the profile step first when there is none. */
    next?: null | string
    resend: () => Promise<void>
  }

  const { confirm, email, next = null, resend }: Props = $props()

  const CODE_LIFETIME_MS = 10 * 60 * 1000
  const store = createFormStore(z.object({ code: z.string() }))
  let sentAt = $state(Date.now())
  let choosing = $state(false)

  // A full load: the session is in the cookies, and the server decides the profile step.
  const leave = () => {
    location.href = signedInRedirectTarget(next)
  }

  async function onsubmit(code: string) {
    const answer = await confirm(code)
    if (answer.next === 'choosePassword') choosing = true
    else if (answer.next === 'forgotPassword')
      location.href = `${resolve('/auth/forgot-password')}?${new URLSearchParams({ contested: '1', email })}`
    else leave()
  }

  async function onresend() {
    await resend()
    sentAt = Date.now()
  }
</script>

{#if choosing}
  <div class="flex flex-col gap-4" in:fade={{ duration: motion(150) }}>
    <p class="text-surface-600-400 text-[14.5px] leading-snug">{m.auth_resetSubtitle()}</p>
    <NewPasswordStep ondone={leave} />
  </div>
{:else}
  <div class="flex flex-col gap-4" out:fade={{ duration: motion(150) }}>
    <p class="text-surface-600-400 text-[14.5px] leading-snug">{m.auth_codeSentTo({ email })}</p>
    <CodeEntry
      field={store.fields.code}
      label={m.auth_codeLabel()}
      length={8}
      {onsubmit}
      {onresend}
      {sentAt}
      expiresAt={sentAt + CODE_LIFETIME_MS}
    />
  </div>
{/if}
