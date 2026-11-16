<script lang="ts">
  import { page } from '$app/state'
  import { authStepHref, type LastMethod, type OAuthProvider } from '$lib/auth'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { tick, type Snippet } from 'svelte'
  import { fade } from 'svelte/transition'
  import ProviderBlock from './ProviderBlock.svelte'

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
    void tick().then(async () => {
      // Kit keeps the remote form's issues across steps; the form's `reset` event is what clears them.
      node.querySelector('form')?.reset()
      // Kit re-reads the emptied form a tick after `reset`, so the reseed has to come after that.
      await tick()
      onswap()
      // The address by type: the bot trap's inputs come first in the form.
      node.querySelector<HTMLElement>(isEmail ? 'input[type="email"]' : 'button')?.focus()
    })
  }
</script>

<!-- One minimum height for both steps, so the swap never moves what sits below. -->
<div class="auth-steps min-h-[18.5rem]">
  {#key email}
    <div in:fade={{ duration: motion(150) }} {@attach entered}>
      {#if email}
        {#if providers.length > 0}
          <!-- eslint-disable svelte/no-navigation-without-resolve -- `authStepHref`: a fixed auth path plus a query -->
          <a
            href={back}
            class="text-primary-600-400 -mt-1.5 mb-3.5 inline-flex items-center gap-1 py-1.5 text-[13.5px] font-semibold"
          >
            <Icon name="chevron-left" size={16} />
            {screen === 'signup' ? m.auth_otherWaysSignUp() : m.auth_otherWays()}
          </a>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}
        {@render children()}
      {:else}
        <ProviderBlock {lastUsed} next={page.url.searchParams.get('next')} {providers} {screen} />
      {/if}
    </div>
  {/key}
</div>
