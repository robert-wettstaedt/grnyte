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
    /** True once the code is in and the new password is asked for. */
    choosing?: boolean
    confirm: (code: string) => Promise<{ next: 'choosePassword' | 'forgotPassword' | 'profile' }>
    email: string
    /** Where to land afterwards; the server's gate opens the profile step first when there is none. */
    next?: null | string
    /** "Wrong address? Go back": back to the address. */
    onback: () => void
    resend: () => Promise<void>
    /** A reset chooses a new password; a contested sign-up chooses its first one. */
    reset?: boolean
    subtitle: string
    title: string
  }

  let {
    choosing = $bindable(false),
    confirm,
    email,
    next = null,
    onback,
    resend,
    reset = false,
    subtitle,
    title,
  }: Props = $props()

  const CODE_LIFETIME_MS = 10 * 60 * 1000
  const store = createFormStore(z.object({ code: z.string() }))
  let sentAt = $state(Date.now())

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

{#snippet heading(text: string, sub: string)}
  <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{text}</h1>
  <p class="text-surface-600-400 mb-5.5 text-[14.5px] leading-snug">{sub}</p>
{/snippet}

{#if choosing}
  <div in:fade={{ duration: motion(150) }}>
    {#if reset}
      {@render heading(m.auth_newPasswordTitle(), m.auth_newPasswordSubtitle())}
    {:else}
      {@render heading(m.auth_chooseTitle(), m.auth_chooseSubtitle())}
    {/if}
    <NewPasswordStep ondone={leave} submitLabel={reset ? m.auth_savePassword() : m.auth_codeContinue()} />
  </div>
{:else}
  <div out:fade={{ duration: motion(150) }}>
    {@render heading(title, subtitle)}
    <CodeEntry
      field={store.fields.code}
      label={m.auth_codeLabel()}
      length={8}
      {onsubmit}
      {onresend}
      {onback}
      {sentAt}
      expiresAt={sentAt + CODE_LIFETIME_MS}
    />
  </div>
{/if}
