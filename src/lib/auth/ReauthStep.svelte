<script lang="ts" module>
  import { serverMessage } from '$lib/forms/issue'
  import { formError } from '$lib/forms/schemas'
  import { getContext, setContext } from 'svelte'

  /** An alternative that leaves the page ("Confirm with Apple") marks the step, so "Send code" holds still. */
  export interface ReauthLeaving {
    leaving: boolean
  }
  const LEAVING = Symbol('reauth-leaving')
  // fallow-ignore-next-line unprovided-inject -- provided by `setContext(LEAVING, ...)` in the instance script below
  export const reauthLeaving = (): ReauthLeaving | undefined => getContext<ReauthLeaving | undefined>(LEAVING)

  /** Whether a screen's command was refused for want of a confirmation: the screen then calls `require()`. */
  export const isReauthRequired = (cause: unknown): boolean => serverMessage(cause) === formError('auth_reauthRequired')

  /** Runs a screen's command and, when it is refused for want of a confirmation, opens the `step`. */
  export async function withReauth<T>(step: undefined | { require(): void }, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (cause) {
      if (isReauthRequired(cause)) step?.require()
      throw cause
    }
  }
</script>

<script lang="ts">
  import type { ReauthAction } from '$lib/auth'
  import Banner from '$lib/components/Banner/Banner.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import SkeletonText from '$lib/components/Skeleton/SkeletonText.svelte'
  import { submitCommand } from '$lib/forms/command'
  import FormHint from '$lib/forms/FormHint.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { leaveIfSessionEnded } from '$lib/state/sessionEnded'
  import { onMount, type Snippet } from 'svelte'
  import { fade, scale, slide } from 'svelte/transition'
  import CodeEntry from './CodeEntry.svelte'
  import { confirmReauthCode, reauthGrantStatus, requestReauthCode } from './reauth.remote'

  // Confirms only: the screen reveals its fields on `confirmed` and runs its own action on submit.
  // Callers key it on action and target, so a new target starts over.
  interface Props {
    action: ReauthAction
    /** "Confirm with Apple" and the like, above "Send code" and beside the code field. Present means one exists. */
    alternatives?: Snippet
    confirmed?: boolean
    /** The signed-in address the code goes to, named before and after sending. */
    email: string
    /** Under "Confirmed": what to press now, naming the screen's own action. */
    next?: string
    /** False until the screen has what decides it, so "Send code" never shows and then vanishes. */
    ready?: boolean
    target: string
  }

  // eslint-disable-next-line no-useless-assignment -- `confirmed` is written for the parent, which reads the binding
  let { action, alternatives, confirmed = $bindable(), email, next, ready = true, target }: Props = $props()

  const store = createFormStore(z.object({ code: z.string() }))

  let phase = $state<'code' | 'confirmed' | 'idle' | 'peeking'>('peeking')
  let sent = $state({ expiresAt: 0, sentAt: 0 })
  let fresh = $state(false)
  let requesting = $state(false)
  let error = $state<null | string>(null)
  const leaving: ReauthLeaving = $state({ leaving: false })
  setContext(LEAVING, leaving)

  const issues = $derived(error == null ? [] : [{ message: error, path: [] }])
  const view = $derived(phase === 'peeking' || !ready ? 'waiting' : phase)

  onMount(() => {
    // Before the peek answers: a reused page must never show the previous target confirmed.
    confirmed = false
    // Through a promise, so a peek that throws (Storybook stubs remotes) settles to "Send code".
    Promise.resolve({ action, target })
      .then(reauthGrantStatus)
      .then(
        (live) => {
          if (phase !== 'peeking') return
          phase = live ? 'confirmed' : 'idle'
          confirmed = live
        },
        (cause) => {
          if (leaveIfSessionEnded(cause)) return
          if (phase === 'peeking') phase = 'idle'
        },
      )
  })

  /** A device signed out elsewhere leaves; the call never settles, so no error text shows meanwhile. */
  const staying = <T,>(run: () => Promise<T>): Promise<T> =>
    submitCommand(run).catch((cause) =>
      leaveIfSessionEnded(cause) ? new Promise<never>(() => {}) : Promise.reject(cause),
    )

  const resend = async () => {
    sent = await staying(() => requestReauthCode({ action, target }))
  }

  async function request() {
    if (requesting) return
    requesting = true
    error = null
    try {
      await resend()
      phase = 'code'
    } catch (cause) {
      error = serverMessage(cause) ?? formError('auth_unexpectedError')
      phase = 'idle'
    } finally {
      requesting = false
    }
  }

  async function confirm(code: string) {
    await staying(() => confirmReauthCode({ action, code, target }))
    fresh = false
    phase = 'confirmed'
    confirmed = true
  }

  /** The screen's command answered `reauthRequired`: ask again, keeping whatever the screen holds. */
  export function require() {
    confirmed = false
    fresh = true
    // With an alternative the person picks; otherwise the code is the only way, so it goes at once.
    if (alternatives == null) void request()
    else phase = 'idle'
  }

  const body = 'text-surface-600-400 text-[14.5px] leading-normal'
</script>

<!-- The skeleton matches the "Send code" card, so nothing below moves when the peek answers. -->
<div
  class="card border-surface-200-800 flex flex-col gap-3 border bg-[light-dark(var(--color-surface-50),var(--color-surface-900))] p-4"
  data-reauth-step
>
  {#if view === 'waiting'}
    <div class="flex flex-col gap-3" aria-busy="true">
      <SkeletonText class="h-4.5 w-[45%]" />
      <SkeletonText class="h-3.5 w-4/5" />
      <SkeletonText class="mt-1 h-12 w-full" />
    </div>
  {:else if view === 'confirmed'}
    <h2 class="text-[15px] font-bold">{m.auth_reauthTitle()}</h2>
    <div class="flex flex-col gap-3" role="status" in:fade={{ duration: motion(150) }}>
      <p class="text-success-600-400 flex items-center gap-2 text-[14.5px] font-semibold">
        <span in:scale={{ duration: motion(150) }}><Icon name="check" size={20} /></span>
        {m.auth_reauthConfirmed()}
      </p>
      {#if next != null}
        <p class={body}>{next}</p>
      {/if}
    </div>
  {:else}
    <h2 class="text-[15px] font-bold">{m.auth_reauthTitle()}</h2>
    {#if fresh}
      <div in:slide={{ duration: motion(150) }}>
        <Banner icon="clock">{m.auth_reauthFresh()}</Banner>
      </div>
    {/if}
    {#if view === 'code'}
      <div class="flex flex-col gap-3" in:slide={{ duration: motion(150) }}>
        <p class={body}>{m.auth_reauthCodeSent({ email })}</p>
        <CodeEntry
          field={store.fields.code}
          label={m.auth_codeLabel()}
          length={6}
          continueButton={false}
          onsubmit={confirm}
          onresend={resend}
          sentAt={sent.sentAt}
          expiresAt={sent.expiresAt}
          {alternatives}
        />
      </div>
    {:else}
      <p class={body}>{m.auth_reauthHint({ email })}</p>
      {#if alternatives != null}
        {@render alternatives()}
        <p class="text-surface-600-400 flex items-center gap-3 text-xs" aria-hidden="true">
          <span class="bg-surface-200-800 h-px flex-1"></span>
          {m.auth_or()}
          <span class="bg-surface-200-800 h-px flex-1"></span>
        </p>
      {/if}
      <button
        type="button"
        class="btn preset-outlined-surface-300-700 h-12 w-full rounded-[10px] text-[15px] font-semibold"
        disabled={requesting || leaving.leaving}
        onclick={request}
      >
        {#if requesting}
          <LoadingIndicator size="18px" />
        {/if}
        {m.auth_reauthSendCode()}
      </button>
      <FormHint {issues} />
    {/if}
  {/if}
</div>
