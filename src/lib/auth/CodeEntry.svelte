<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { formError } from '$lib/forms/schemas'
  import type { StoreField } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { tick, type Snippet } from 'svelte'
  import { slide } from 'svelte/transition'

  // One numeric field for a mailed code. It renders no <form> and its input has no name, so a
  // surrounding Form neither submits from it nor copies the digits into its payload.
  interface Props {
    /** "Confirm with Apple" and the like, under the field. */
    alternatives?: Snippet
    expiresAt: number
    /** Hosts the issues the caller's store routes to the code. */
    field: StoreField<string>
    label: string
    length: 6 | 8
    /** The caller sends; a rejection rolls the countdown back and shows the error. */
    onresend: () => Promise<void>
    /** Runs once `length` digits are present; a rejection's message shows under the field. */
    onsubmit: (code: string) => Promise<void>
    sentAt: number
  }

  const { alternatives, expiresAt, field, label, length, onresend, onsubmit, sentAt }: Props = $props()

  const RESEND_AFTER_S = 60

  let digits = $state('')
  let pending = $state(false)
  let error = $state<null | string>(null)
  let resentAt = $state<null | number>(null)
  let justSent = $state(false)
  let now = $state(Date.now())
  let wrapper: HTMLDivElement | undefined = $state()

  const lengthLine = $derived(length === 8 ? formError('auth_codeLength8') : formError('auth_codeLength6'))
  const startedAt = $derived(Math.max(sentAt, resentAt ?? 0))
  const remaining = $derived(Math.max(0, Math.ceil(RESEND_AFTER_S - (now - startedAt) / 1000)))
  const expired = $derived(now >= expiresAt)
  const canResend = $derived(remaining === 0 || expired)
  const countdown = $derived(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`)

  // The caller's store issues, or this field's own: `FormHint` renders either as an alert.
  const local: StoreField<string> = {
    as: (type) => ({ ...field.as(type), name: '', value: digits }),
    issues: () => (error == null ? field.issues() : [{ message: error, path: [] }]),
    set: (value) => (digits = value),
    value: () => digits,
  }

  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(timer)
  })

  // Announced once per countdown, when it runs out; the digits themselves are not live.
  const announced = $derived(canResend ? m.auth_codeResendAvailable() : '')

  const input = () => wrapper?.querySelector('input') ?? undefined

  async function submit(code: string) {
    if (pending) return
    pending = true
    error = null
    try {
      await onsubmit(code)
    } catch (cause) {
      error = (cause as { body?: { message?: string } })?.body?.message ?? formError('auth_unexpectedError')
      pending = false
      await tick()
      input()?.focus()
      input()?.select()
      return
    }
    pending = false
  }

  function oninput(event: Event) {
    const target = event.currentTarget as HTMLInputElement
    digits = target.value.replace(/\D/g, '').slice(0, length)
    target.value = digits
    error = null
    if (digits.length === length) void submit(digits)
  }

  // A paste or an autofill may fire no input event, so the button reads the field itself.
  function onContinue() {
    const code = (input()?.value ?? digits).replace(/\D/g, '').slice(0, length)
    if (code.length < length) {
      error = lengthLine
      return
    }
    digits = code
    void submit(code)
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || (event.target as HTMLElement).tagName !== 'INPUT') return
    event.preventDefault()
    onContinue()
  }

  async function resend() {
    const before = resentAt
    resentAt = Date.now()
    now = resentAt
    justSent = true
    error = null
    try {
      await onresend()
    } catch (cause) {
      resentAt = before
      justSent = false
      error = (cause as { body?: { message?: string } })?.body?.message ?? formError('auth_mailUnavailable')
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex flex-col gap-3" bind:this={wrapper} {onkeydown}>
  <AuthField
    field={local}
    {label}
    type="text"
    autocomplete="one-time-code"
    inputmode="numeric"
    pattern="[0-9]*"
    maxlength={length}
    autocapitalize="none"
    enterkeyhint="go"
    readonly={pending}
    {oninput}
  />
  <p class="text-surface-600-400 -mt-1 text-sm">
    {length === 8 ? m.auth_codeLength8() : m.auth_codeLength6()}
  </p>

  {#if expired}
    <p class="text-warning-700-300 text-sm" transition:slide={{ duration: motion(150) }}>{m.auth_codeExpired()}</p>
  {/if}

  <button type="button" class="btn preset-filled-primary-500 h-11" disabled={pending} onclick={onContinue}>
    {#if pending}
      <LoadingIndicator size="18px" />
    {/if}
    {m.auth_codeContinue()}
  </button>

  <div class="flex min-h-6 items-center gap-2 text-sm">
    {#if canResend}
      <button type="button" class="text-primary-600-400 font-semibold" onclick={resend}>{m.auth_codeResend()}</button>
    {:else}
      <span class="text-surface-600-400 tabular-nums">
        {justSent ? `${m.auth_codeSent()} · ` : ''}{m.auth_codeResendIn({ time: countdown })}
      </span>
    {/if}
  </div>
  <p class="sr-only" aria-live="polite">{announced}</p>

  {@render alternatives?.()}
</div>
