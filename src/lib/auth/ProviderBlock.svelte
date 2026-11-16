<script lang="ts" module>
  export type LastMethod = 'apple' | 'email' | 'google'
</script>

<script lang="ts">
  import { page } from '$app/state'
  import { authStepHref } from '$lib/auth'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { slide } from 'svelte/transition'
  import AppleLogo from './AppleLogo.svelte'
  import GoogleLogo from './GoogleLogo.svelte'

  // The choice step of sign-in and create account: Apple, Google, then email.
  interface Props {
    lastUsed: LastMethod | null
    next: null | string
    /** Never empty: a page with no provider shows its form instead. */
    providers: ('apple' | 'google')[]
    screen: 'signin' | 'signup'
  }

  const { lastUsed, next, providers, screen }: Props = $props()

  const id = $props.id()
  const ordered = $derived((['apple', 'google'] as const).filter((provider) => providers.includes(provider)))
  // Create account never badges email: its button makes an account rather than signing in.
  const badged = $derived(lastUsed === 'email' && screen === 'signup' ? null : lastUsed)
  const emailHref = $derived(authStepHref(page.url, `/auth/${screen}`, true))

  let pending = $state<LastMethod | null>(null)
  let offline = $state(false)

  function press(event: SubmitEvent, provider: LastMethod) {
    if (pending != null) return event.preventDefault()
    if (!navigator.onLine) {
      event.preventDefault()
      offline = true
      return
    }
    offline = false
    pending = provider
  }

  // Back from the provider through the back/forward cache: the page is live again.
  function restore(event: PageTransitionEvent) {
    if (event.persisted) pending = null
  }

  const LABELS = { apple: m.auth_continueWithApple, email: m.auth_continueWithEmail, google: m.auth_continueWithGoogle }
  const BRAND = {
    apple: 'bg-black text-white dark:bg-white dark:text-black',
    google:
      'border border-[#747775] bg-white text-[#1F1F1F] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3]',
  }
  // One height, width and corner radius for all three; labels wrap for 200 % zoom.
  const shape = (method: LastMethod) => [
    'btn min-h-11 h-auto w-full gap-2.5 rounded-lg py-2.5 text-[15px] font-medium leading-5 whitespace-normal text-balance',
    // A badged button keeps a wrapped label clear of the pill on its trailing corner.
    badged === method ? 'ps-4 pe-[5.5em]' : 'px-4',
    pending != null && pending !== method && 'pointer-events-none opacity-50',
  ]
</script>

<svelte:window onpageshow={restore} />

{#snippet badge(method: LastMethod)}
  {#if badged === method}
    <span
      id="{id}-last-used"
      class="bg-primary-500 text-primary-contrast-500 pointer-events-none absolute end-3 top-0 -translate-y-1/2 rounded-full px-[0.6em] py-[0.15em] text-[0.6875rem] leading-tight font-semibold"
    >
      {m.auth_lastUsed()}
    </span>
  {/if}
{/snippet}

<div class="flex flex-col gap-5">
  {#each ordered as provider (provider)}
    <form method="post" action="/auth/oauth/{provider}" class="relative" onsubmit={(event) => press(event, provider)}>
      <input type="hidden" name="intent" value="signin" />
      <input type="hidden" name="screen" value={screen} />
      {#if next != null}
        <input type="hidden" name="next" value={next} />
      {/if}
      <button
        type="submit"
        class={[shape(provider), BRAND[provider]]}
        disabled={pending != null}
        aria-busy={pending === provider}
        aria-describedby={badged === provider ? `${id}-last-used` : undefined}
      >
        {#if pending === provider}
          <span class="contents" aria-hidden="true"><LoadingIndicator size="18px" /></span>
        {:else if provider === 'apple'}
          <AppleLogo class="h-[1.125em] w-auto shrink-0" />
        {:else}
          <GoogleLogo class="h-[1.125em] w-auto shrink-0" />
        {/if}
        {LABELS[provider]()}
      </button>
      {@render badge(provider)}
    </form>
  {/each}

  <div class="relative">
    <!-- eslint-disable svelte/no-navigation-without-resolve -- `authStepHref`: a fixed auth path plus a query -->
    <a
      href={emailHref}
      class={[shape('email'), 'preset-outlined-surface-300-700']}
      aria-disabled={pending != null ? 'true' : undefined}
      tabindex={pending != null ? -1 : undefined}
      aria-describedby={badged === 'email' ? `${id}-last-used` : undefined}
    >
      {LABELS.email()}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {@render badge('email')}
  </div>

  {#if offline}
    <p class="card preset-tonal-warning px-4 py-3 text-sm" role="alert" in:slide={{ duration: motion(150) }}>
      {m.auth_offline()}
    </p>
  {/if}
</div>
