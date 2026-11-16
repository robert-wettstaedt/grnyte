<script lang="ts" module>
  import { formError } from '$lib/forms/schemas'

  /** Whether a screen's command was refused for want of a confirmation: the screen then calls `require()`. */
  export const isReauthRequired = (cause: unknown): boolean =>
    (cause as undefined | { body?: { message?: string } })?.body?.message === formError('auth_reauthRequired')
</script>

<script lang="ts">
  import type { ReauthAction } from '$lib/auth'
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
    /** "Confirm with Apple" and the like, beside "Send code" and the code field. */
    alternatives?: Snippet
    /** Something below blocks the action: a one-line state, no "Send code". */
    blocked?: boolean
    confirmed?: boolean
    /** False until the screen has what decides it, so "Send code" never shows and then vanishes. */
    ready?: boolean
    target: string
  }

  // eslint-disable-next-line no-useless-assignment -- `confirmed` is written for the parent, which reads the binding
  let { action, alternatives, blocked = false, confirmed = $bindable(), ready = true, target }: Props = $props()

  const store = createFormStore(z.object({ code: z.string() }))

  let phase = $state<'code' | 'confirmed' | 'idle' | 'peeking'>('peeking')
  let sent = $state({ expiresAt: 0, sentAt: 0 })
  let fresh = $state(false)
  let requesting = $state(false)
  let error = $state<null | string>(null)

  const issues = $derived(error == null ? [] : [{ message: error, path: [] }])
  const view = $derived.by(() => {
    if (phase === 'peeking' || !ready) return 'waiting'
    if (blocked) return 'blocked'
    return phase
  })

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
      error = (cause as { body?: { message?: string } })?.body?.message ?? formError('auth_unexpectedError')
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
    void request()
  }
</script>

<!-- One container that keeps the "Send code" card's height through every state, so nothing below moves. -->
{#snippet heading()}
  <h2 class="text-sm font-semibold">{m.auth_reauthTitle()}</h2>
  {#if fresh}
    <p class="text-warning-700-300 text-sm" in:slide={{ duration: motion(150) }}>{m.auth_reauthFresh()}</p>
  {/if}
{/snippet}

<div class="card preset-outlined-surface-200-800 min-h-36 space-y-3 p-4" data-reauth-step>
  {#if view === 'waiting'}
    <div class="space-y-3" aria-busy="true">
      <SkeletonText class="h-4 w-40" />
      <SkeletonText class="h-3 w-56" />
      <SkeletonText class="h-10 w-full" />
    </div>
  {:else if view === 'blocked'}
    <p class="text-surface-600-400 text-sm">{m.auth_reauthBlocked()}</p>
  {:else if view === 'confirmed'}
    <p class="flex items-center gap-2 text-sm font-semibold" in:fade={{ duration: motion(150) }}>
      <span class="text-success-600-400" in:scale={{ duration: motion(150) }}><Icon name="check" size={18} /></span>
      {m.auth_reauthConfirmed()}
    </p>
  {:else if view === 'code'}
    {@render heading()}
    <div in:slide={{ duration: motion(150) }}>
      <CodeEntry
        field={store.fields.code}
        label={m.auth_codeLabel()}
        length={6}
        onsubmit={confirm}
        onresend={resend}
        sentAt={sent.sentAt}
        expiresAt={sent.expiresAt}
        {alternatives}
      />
    </div>
  {:else}
    {@render heading()}
    <p class="text-surface-600-400 text-sm">{m.auth_reauthHint()}</p>
    <button type="button" class="btn preset-tonal-primary h-11 w-full" disabled={requesting} onclick={request}>
      <LoadingIndicator class={requesting ? '' : 'hidden'} size="18px" />
      {m.auth_reauthSendCode()}
    </button>
    {@render alternatives?.()}
    <FormHint {issues} />
  {/if}
</div>
