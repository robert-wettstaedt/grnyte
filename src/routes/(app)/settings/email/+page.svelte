<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import CodeEntry from '$lib/auth/CodeEntry.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { fade } from 'svelte/transition'
  import { confirmEmailChangeCode, updateEmailCommand } from '../account.remote'
  import { updateEmailSchema } from '../schemas'

  const CODE_LIFETIME_MS = 10 * 60 * 1000

  const store = createFormStore(updateEmailSchema)
  const codes = createFormStore(z.object({ code: z.string() }))
  let change = $state<{ current: string; email: string }>()
  // One code at a time; which one comes from the server's answer, never from a count.
  let step = $state<'current' | 'new'>('current')
  let sentAt = $state(0)
  let resent = $state(false)

  const submit = async (values: { email: string }) => {
    const { current, email } = await submitCommand(() => updateEmailCommand(values))
    change = { current, email }
    sentAt = Date.now()
  }

  async function onsubmit(code: string) {
    if (change == null) return
    const answer = await confirmEmailChangeCode({ code, email: step === 'current' ? change.current : change.email })
    // A full load: the new session is in the cookies.
    if (answer.step === 'done') location.href = resolve('/settings')
    else step = 'new'
  }

  // GoTrue mints new codes for both addresses, so an accepted first code no longer counts.
  async function onresend() {
    if (change == null) return
    await updateEmailCommand({ email: change.email })
    step = 'current'
    resent = true
    sentAt = Date.now()
  }

  const currentEmail = $derived(page.data.session?.user.email)

  const goBack = () => back(resolve('/settings'))
</script>

<svelte:head>
  <title>{m.settings_changeEmail()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if change != null}
  <PageHeader backLabel={m.common_cancel()} onback={goBack} title={m.settings_changeEmail()} />
  <div class="mx-auto max-w-screen-sm px-4 py-6">
    {#key `${step}:${sentAt}`}
      <div class="flex flex-col gap-4" in:fade={{ duration: motion(150) }}>
        {#if resent && step === 'current'}
          <p class="card preset-tonal-success px-4 py-3 text-sm" role="status">{m.settings_emailCodesResent()}</p>
        {/if}
        <p class="text-surface-600-400 text-[14.5px] leading-snug">
          {step === 'current'
            ? m.settings_emailCodeCurrent({ email: change.current })
            : m.settings_emailCodeNew({ email: change.email })}
        </p>
        <CodeEntry
          field={codes.fields.code}
          label={m.auth_codeLabel()}
          length={8}
          {onsubmit}
          {onresend}
          {sentAt}
          expiresAt={sentAt + CODE_LIFETIME_MS}
        />
      </div>
    {/key}
  </div>
{:else}
  <Form
    stayOnSubmit
    {store}
    {submit}
    cancelTo={resolve('/settings')}
    submitLabel={m.common_save()}
    title={m.settings_changeEmail()}
  >
    <AuthField
      field={store.fields.email}
      label={m.settings_emailNew()}
      type="email"
      placeholder={currentEmail ?? 'you@example.com'}
      autocomplete="email"
      autocapitalize="none"
      enterkeyhint="go"
      autofocus
    />

    <p class="text-surface-600-400 text-sm">{m.settings_emailChangeHint()}</p>
  </Form>
{/if}
