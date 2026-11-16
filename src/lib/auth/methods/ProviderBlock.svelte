<script lang="ts">
  import { page } from '$app/state'
  import { authStepHref, IDENTITY_TARGETS, type LastMethod, type OAuthProvider } from '$lib/auth'
  import Banner from '$lib/components/Banner/Banner.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { slide } from 'svelte/transition'
  import AppleLogo from './AppleLogo.svelte'
  import GoogleLogo from './GoogleLogo.svelte'

  interface Props {
    lastUsed: LastMethod | null
    next: null | string
    /** Never empty: a page with no provider shows its form instead. */
    providers: OAuthProvider[]
    screen: 'signin' | 'signup'
  }

  const { lastUsed, next, providers, screen }: Props = $props()

  const id = $props.id()
  const ordered = $derived(IDENTITY_TARGETS.filter((provider) => providers.includes(provider)))
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
    // Google's guide: Roboto Medium, self-hosted like the app's other fonts.
    google:
      'border border-[#747775] bg-white font-medium text-[#1F1F1F] [font-family:Roboto,system-ui,sans-serif] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3]',
  }
  // The badge sits on the top border, so a centred label never runs under it, even wrapped at 200%.
  const shape = (method: LastMethod) => [
    'btn min-h-12 h-auto w-full gap-2 rounded-[10px] px-3.5 py-1.5 text-[15px] font-semibold leading-5 whitespace-normal text-balance',
    pending != null && pending !== method && 'pointer-events-none opacity-50',
  ]
</script>

<svelte:window onpageshow={restore} />

{#snippet badge(method: LastMethod)}
  {#if badged === method}
    <span
      id="{id}-last-used"
      class="bg-primary-500 text-primary-contrast-500 pointer-events-none absolute end-3 top-0 -translate-y-1/2 rounded-full px-[0.6em] py-[0.15em] text-[0.6875rem] leading-tight font-bold ring-2 ring-[light-dark(var(--color-surface-50),var(--color-surface-950))]"
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
      class={[shape('email'), 'preset-outlined-surface-300-700 bg-surface-50-950']}
      aria-disabled={pending != null ? 'true' : undefined}
      tabindex={pending != null ? -1 : undefined}
      aria-describedby={badged === 'email' ? `${id}-last-used` : undefined}
    >
      <Icon name="mail" size={18} />
      {LABELS.email()}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {@render badge('email')}
  </div>

  {#if offline}
    <div in:slide={{ duration: motion(150) }}>
      <Banner tone="error" icon="cloud-off"><p>{m.auth_offline()}</p></Banner>
    </div>
  {/if}
</div>
