<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { ReauthAction } from '$lib/auth'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import AppleLogo from './AppleLogo.svelte'
  import { reauthLeaving } from './ReauthStep.svelte'

  // A screen passes this as `ReauthStep`'s `alternatives` only when the account has Apple and Apple is configured.
  interface Props {
    action: ReauthAction
    /** Where Apple's return lands; the current path and query by default. */
    returnTo?: string
    target: string
    /** `filled` for a deletion or Apple's own removal, with the revocation caption; `plain` elsewhere. */
    variant?: 'filled' | 'plain'
  }

  const { action, returnTo, target, variant = 'plain' }: Props = $props()

  const step = reauthLeaving()
  let pending = $state(false)

  // Not a nested <form>: every step sits inside its screen's form, whose submit would run the action.
  function leave() {
    if (pending) return
    pending = true
    if (step != null) step.leaving = true
    const form = document.createElement('form')
    form.method = 'post'
    form.action = resolve('/auth/oauth/apple')
    const fields = { action, intent: 'confirm', returnTo: returnTo ?? page.url.pathname + page.url.search, target }
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.append(input)
    }
    document.body.append(form)
    form.submit()
  }

  // Back from Apple through the back/forward cache: the page is live again.
  function restore(event: PageTransitionEvent) {
    if (!event.persisted) return
    pending = false
    if (step != null) step.leaving = false
  }
</script>

<svelte:window onpageshow={restore} />

<div class="space-y-1.5">
  <button
    type="button"
    class={[
      'btn h-11 w-full gap-2 rounded-lg text-[15px] font-medium',
      variant === 'filled'
        ? 'bg-black text-white dark:bg-white dark:text-black'
        : 'border border-black bg-white text-black dark:border-white dark:bg-black dark:text-white',
    ]}
    disabled={pending}
    onclick={leave}
  >
    {#if pending}
      <LoadingIndicator size="18px" />
    {:else}
      <AppleLogo class="h-4.5 w-auto" />
    {/if}
    {m.auth_confirmWithApple()}
  </button>
  {#if variant === 'filled'}
    <p class="text-surface-600-400 text-center text-xs">{m.auth_confirmWithAppleRevokes()}</p>
  {/if}
</div>
