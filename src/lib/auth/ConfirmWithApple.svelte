<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { revokes, type ReauthAction } from '$lib/auth'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import AppleLogo from './AppleLogo.svelte'

  interface Props {
    action: ReauthAction
    /** Set while the page is leaving for Apple, for the step around it. */
    pending?: boolean
    /** Where Apple's return lands; the current path and query by default. */
    returnTo?: string
    target: string
  }

  let { action, pending = $bindable(false), returnTo, target }: Props = $props()

  // A deletion or Apple's own removal revokes grnyte at Apple: filled, with the caption.
  const filled = $derived(revokes(action, target))

  // Not a nested <form>: every step sits inside its screen's form, whose submit would run the action.
  function leave() {
    if (pending) return
    pending = true
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
  }
</script>

<svelte:window onpageshow={restore} />

<div class="flex flex-col gap-3">
  <button
    type="button"
    class={[
      'btn h-12 w-full gap-2 rounded-[10px] text-[15px] font-semibold',
      filled
        ? 'bg-black text-white dark:bg-white dark:text-black'
        : 'border-surface-950-50 text-surface-950-50 border bg-transparent',
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
  {#if filled}
    <p class="text-surface-600-400 -mt-1 text-[12.5px] leading-snug">{m.auth_confirmWithAppleRevokes()}</p>
    <p class="text-surface-600-400 flex items-center gap-3 text-[12.5px]" aria-hidden="true">
      <span class="bg-surface-200-800 h-px flex-1"></span>
      {m.auth_or()}
      <span class="bg-surface-200-800 h-px flex-1"></span>
    </p>
  {/if}
</div>
