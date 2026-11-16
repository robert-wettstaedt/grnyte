<script lang="ts">
  import Banner from '$lib/components/Banner/Banner.svelte'
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
    /** The landing steps keep Continue for a paste; re-auth and email change submit on the last digit only. */
    continueButton?: boolean
    expiresAt: number
    /** Hosts the issues the caller's store routes to the code. */
    field: StoreField<string>
    /** Under the field in place of "It works for 10 minutes." */
    hint?: string
    label: string
    length: 6 | 8
    /** "Wrong address? Go back" beside the resend, back to the address. */
    onback?: () => void
    /** The caller sends; a rejection rolls the countdown back and shows the error. */
    onresend: () => Promise<void>
    /** Runs once `length` digits are present; a rejection's message shows under the field. */
    onsubmit: (code: string) => Promise<void>
    sentAt: number
  }

  const {
    alternatives,
    continueButton = true,
    expiresAt,
    field,
    hint = m.auth_codeLifetime(),
    label,
    length,
    onback,
    onresend,
    onsubmit,
    sentAt,
  }: Props = $props()

  const RESEND_AFTER_S = 60

  // Digits and the dots still to type share one left edge: the start of the whole code, centred
  // (monospace, so `length` characters plus the spacing between them).
  const CODE_TYPE = 'font-mono text-2xl tracking-[0.4em]'
  const START = { 6: 'ps-[calc(50%-(6ch+2em)/2)]', 8: 'ps-[calc(50%-(8ch+2.8em)/2)]' } as const

  let digits = $state('')
  let pending = $state(false)
  let error = $state<null | string>(null)
  // The code is void after too many tries: only a new one clears it, never an edit.
  let locked = $state(false)
  let resentAt = $state<null | number>(null)
  let now = $state(Date.now())
  let wrapper: HTMLDivElement | undefined = $state()

  const lengthLine = $derived(length === 8 ? formError('auth_codeLength8') : formError('auth_codeLength6'))
  const startedAt = $derived(Math.max(sentAt, resentAt ?? 0))
  const remaining = $derived(Math.max(0, Math.ceil(RESEND_AFTER_S - (now - startedAt) / 1000)))
  const expired = $derived(now >= expiresAt)
  const canResend = $derived(remaining === 0 || expired || locked)
  const complete = $derived(digits.length === length && !locked)
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
  const messageOf = (cause: unknown, fallback: Parameters<typeof formError>[0]) =>
    (cause as { body?: { message?: string } })?.body?.message ?? formError(fallback)

  async function submit(code: string) {
    if (pending || locked) return
    pending = true
    error = null
    try {
      await onsubmit(code)
    } catch (cause) {
      error = messageOf(cause, 'auth_unexpectedError')
      locked = error === formError('auth_codeLocked')
      pending = false
      await tick()
      input()?.focus()
      input()?.select()
      return
    }
    pending = false
  }

  function sync(target: HTMLInputElement | undefined) {
    if (target == null) return
    const next = target.value.replace(/\D/g, '').slice(0, length)
    target.value = next
    if (next === digits) return
    digits = next
    if (locked) return
    error = null
    if (digits.length === length) void submit(digits)
  }

  const oninput = (event: Event) => sync(event.currentTarget as HTMLInputElement)
  // Some autofills set the value without an input event: catch it when the field changes or regains focus.
  const resync = () => sync(input())

  // A paste or an autofill may fire no input event, so the button reads the field itself.
  function onContinue() {
    const code = (input()?.value ?? digits).replace(/\D/g, '').slice(0, length)
    if (locked) return
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
    const before = { locked, resentAt }
    resentAt = Date.now()
    now = resentAt
    error = null
    locked = false
    try {
      await onresend()
    } catch (cause) {
      ;({ locked, resentAt } = before)
      error = messageOf(cause, 'auth_mailUnavailable')
    }
  }
</script>

{#snippet overlay()}
  <!-- The typed digits again, invisible, so the dots start where the input's text ends. -->
  <span class="pointer-events-none absolute inset-px flex items-center {CODE_TYPE} {START[length]}" aria-hidden="true">
    <span class="invisible">{digits}</span>
    <span class="text-surface-500">{'·'.repeat(length - digits.length)}</span>
  </span>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex flex-col gap-4" bind:this={wrapper} {onkeydown} onchange={resync} onfocusin={resync}>
  {#if expired}
    <div transition:slide={{ duration: motion(150) }}>
      <Banner icon="clock">{m.auth_codeExpired()}</Banner>
    </div>
  {/if}

  <AuthField
    field={local}
    {label}
    type="text"
    autocomplete="one-time-code"
    inputmode="numeric"
    pattern="[0-9]*"
    maxlength={length}
    inputClass="h-14 pe-3.5 {CODE_TYPE} {START[length]}"
    {overlay}
    hint={expired ? undefined : hint}
    autocapitalize="none"
    enterkeyhint="go"
    readonly={pending}
    autofocus
    {oninput}
  />

  {#if continueButton}
    <!-- Off until every digit is in; the spinner keeps the full colour while the code is checked. -->
    <button
      type="button"
      class={[
        'btn preset-filled-primary-500 h-12.5 w-full font-semibold',
        complete || pending ? 'shadow-[0_10px_28px_-12px_var(--color-primary-500)] disabled:opacity-100' : 'opacity-55',
      ]}
      disabled={pending || !complete}
      onclick={onContinue}
    >
      {#if pending}
        <LoadingIndicator size="16px" />
        {m.auth_codeChecking()}
      {:else}
        {m.auth_codeContinue()}
      {/if}
    </button>
  {/if}

  <div class="text-surface-600-400 flex min-h-6 items-center justify-between gap-2 text-[13px]">
    <!-- The countdown is the same button, off, so the row never changes shape. -->
    <button
      type="button"
      class={['py-1.5 font-semibold tabular-nums', canResend ? 'text-primary-600-400' : 'text-surface-500']}
      disabled={!canResend}
      onclick={resend}
    >
      {canResend ? m.auth_codeResend() : m.auth_codeResendIn({ time: countdown })}
    </button>
    {#if onback != null}
      <span>
        {m.auth_codeWrongAddress()}
        <button type="button" class="text-primary-600-400 text-[12.5px] font-semibold" onclick={onback}>
          {m.auth_codeGoBack()}
        </button>
      </span>
    {/if}
  </div>
  <p class="sr-only" aria-live="polite">{announced}</p>

  {@render alternatives?.()}
</div>
