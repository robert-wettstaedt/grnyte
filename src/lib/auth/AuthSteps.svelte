<script lang="ts">
  import { page } from '$app/state'
  import { authStepHref } from '$lib/auth'
  import type { OAuthProvider } from '$lib/auth/oauth/providers.server'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { tick, type Snippet } from 'svelte'
  import { fade } from 'svelte/transition'
  import ProviderBlock, { type LastMethod } from './ProviderBlock.svelte'

  // Sign-in and create account: the choice, or the email step (design decision 8). The URL decides.
  interface Props {
    /** The email step: the screen's form. */
    children: Snippet
    lastUsed: LastMethod | null
    /** After a swap, once the new step is in the DOM and its form reset: the screen reseeds its fields. */
    onswap: () => void
    providers: OAuthProvider[]
    screen: 'signin' | 'signup'
  }

  const { children, lastUsed, onswap, providers, screen }: Props = $props()

  // A no-JS submit lands on Kit's `?/remote=` URL without `method`: still the form, never the choice.
  const email = $derived(
    providers.length === 0 || page.url.searchParams.get('method') === 'email' || page.url.search.includes('/remote='),
  )
  const back = $derived(authStepHref(page.url, `/auth/${screen}`, false))

  let swapped = false
  // Runs on each keyed mount; the first is the page load, which keeps the server's state and focus.
  function entered(node: HTMLElement) {
    if (!swapped) {
      swapped = true
      return
    }
    const isEmail = email
    void tick().then(() => {
      // Kit keeps the remote form's issues across steps; the form's `reset` event is what clears them.
      node.querySelector('form')?.reset()
      onswap()
      node.querySelector<HTMLElement>(isEmail ? 'input:not([type="hidden"])' : 'button')?.focus()
    })
  }
</script>

<!-- One minimum height for both steps, so the swap never moves what sits below. -->
<div class="auth-steps min-h-[17.5rem]">
  {#key email}
    <div in:fade={{ duration: motion(150) }} {@attach entered}>
      {#if email}
        {#if providers.length > 0}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `authStepHref`: a fixed auth path plus a query -->
          <a href={back} class="text-primary-400 mb-4 inline-flex min-h-6 items-center text-[13.5px] font-semibold">
            {m.auth_otherWays()}
          </a>
        {/if}
        {@render children()}
      {:else}
        <ProviderBlock {lastUsed} next={page.url.searchParams.get('next')} {providers} {screen} />
      {/if}
    </div>
  {/key}
</div>
