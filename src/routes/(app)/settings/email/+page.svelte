<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import CodeEntry from '$lib/auth/CodeEntry.svelte'
  import Banner from '$lib/components/Banner/Banner.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { toaster } from '$lib/state/toast'
  import { onMount } from 'svelte'
  import { fade, slide } from 'svelte/transition'
  import { confirmEmailChangeCode, updateEmailCommand } from '../account.remote'
  import { updateEmailSchema } from '../schemas'

  const CODE_LIFETIME_MS = 10 * 60 * 1000
  const CHANGED = 'changed'

  const store = createFormStore(updateEmailSchema)
  const codes = createFormStore(z.object({ code: z.string() }))
  let change = $state<{ current: string; email: string }>()
  // One code at a time; which one comes from the server's answer, never from a count.
  let step = $state<'current' | 'new'>('current')
  let sentAt = $state(0)
  let resent = $state(false)

  // Back from the full load that adopted the new session: the change is done.
  const changed = page.url.searchParams.has(CHANGED)
  onMount(() => {
    if (changed) toaster.create({ title: m.settings_emailChanged(), type: 'success' })
  })

  const submit = async (values: { email: string }) => {
    const { current, email } = await submitCommand(() => updateEmailCommand(values))
    change = { current, email }
    sentAt = Date.now()
  }

  async function onsubmit(code: string) {
    if (change == null) return
    const answer = await confirmEmailChangeCode({ code, email: step === 'current' ? change.current : change.email })
    // A full load, replacing this entry: the new session is in the cookies.
    if (answer.step === 'done') location.replace(`${resolve('/settings/email')}?${CHANGED}`)
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

  const currentEmail = $derived(change?.current ?? page.data.session?.user.email ?? '')
  const currentId = $props.id()

  // Send codes, then Confirm greyed while the codes are asked for, then Save greyed once changed.
  const header = $derived.by((): { icon?: 'send'; label: string } => {
    if (change != null) return { label: m.settings_emailConfirm() }
    return changed ? { label: m.common_save() } : { icon: 'send', label: m.settings_emailSendCodes() }
  })
  const code = $derived.by(() => {
    if (change == null) return undefined
    if (step === 'current')
      return {
        done: undefined,
        hint: undefined,
        notice: resent ? m.settings_emailCodesResent() : undefined,
        step: m.settings_emailStepCurrent(),
        to: change.current,
      }
    return {
      done: m.settings_emailCurrentConfirmed(),
      hint: m.settings_emailAlreadySent(),
      notice: undefined,
      step: m.settings_emailStepNew(),
      to: change.email,
    }
  })
</script>

<svelte:head>
  <title>{m.settings_changeEmail()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  stayOnSubmit
  {store}
  {submit}
  cancelTo={resolve('/settings')}
  submitDisabled={header.icon == null}
  submitIcon={header.icon}
  submitLabel={header.label}
  title={m.settings_changeEmail()}
>
  <p class="text-surface-600-400 text-[14.5px] leading-normal">{m.settings_emailIntro()}</p>

  <div class="flex flex-col gap-1.5">
    <label for={currentId} class="text-surface-950-50 self-start text-[13px] font-semibold">
      {m.settings_emailCurrent()}
    </label>
    <input
      id={currentId}
      class="input bg-surface-100-900 text-surface-600-400 h-12 px-3.5"
      readonly
      tabindex="-1"
      value={currentEmail}
    />
  </div>

  {#if !changed}
    <AuthField
      field={store.fields.email}
      label={m.settings_emailNew()}
      type="email"
      placeholder="you@example.com"
      autocomplete="email"
      autocapitalize="none"
      enterkeyhint="go"
      readonly={change != null}
      inputClass={change != null ? 'bg-surface-100-900! text-surface-600-400! h-12 px-3.5' : undefined}
      autofocus
    />
  {/if}

  {#if code != null}
    <div class="flex flex-col gap-4" transition:slide={{ duration: motion(150) }}>
      <hr class="hr" />
      {#key `${step}:${sentAt}`}
        <div class="flex flex-col gap-4" in:fade={{ duration: motion(150) }}>
          {#if code.notice != null}
            <Banner>{code.notice}</Banner>
          {/if}
          {#if code.done != null}
            <p class="text-success-600-400 text-[12.5px] font-semibold">{code.done}</p>
          {/if}
          <span class="text-surface-600-400 text-xs font-bold tracking-wide uppercase">{code.step}</span>
          <CodeEntry
            field={codes.fields.code}
            label={m.settings_emailCodeTo({ email: code.to })}
            length={8}
            continueButton={false}
            hint={code.hint}
            {onsubmit}
            {onresend}
            {sentAt}
            expiresAt={sentAt + CODE_LIFETIME_MS}
          />
        </div>
      {/key}
    </div>
  {/if}
</Form>
