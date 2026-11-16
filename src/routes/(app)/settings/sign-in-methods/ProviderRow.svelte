<script lang="ts">
  import { page } from '$app/state'
  import AppleLogo from '$lib/auth/AppleLogo.svelte'
  import ConfirmWithApple from '$lib/auth/ConfirmWithApple.svelte'
  import GoogleLogo from '$lib/auth/GoogleLogo.svelte'
  import ReauthStep from '$lib/auth/ReauthStep.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { slide } from 'svelte/transition'
  import MethodRow, { rowAction } from './MethodRow.svelte'

  // One provider on the sign-in methods screen: name, status line, Add or Remove, and its inline step.
  interface Props {
    /** The account has Apple and this origin offers it: every step may confirm with Apple. */
    appleAvailable: boolean
    /** This origin offers the provider, so an unlinked row has "Add". */
    configured: boolean
    identity: { canUnlink: boolean; linked: boolean; relinks: boolean }
    onremove: () => void
    ontoggle: () => void
    open: boolean
    provider: 'apple' | 'google'
    running: boolean
  }

  const { appleAvailable, configured, identity, onremove, ontoggle, open, provider, running }: Props = $props()

  const name = $derived(provider === 'apple' ? 'Apple' : 'Google')
  const verb = $derived(identity.linked ? 'remove' : 'add')
  const action = $derived(identity.linked ? 'identity.unlink' : 'identity.link')
  // Linked, but nothing else would sign the account in: Remove stays, disabled, with the reason.
  const stuck = $derived(identity.linked && !identity.canUnlink)
  let confirmed = $state(false)
</script>

{#snippet withApple()}
  <ConfirmWithApple
    {action}
    target={provider}
    returnTo="/settings/sign-in-methods?step={verb}-{provider}"
    variant={verb === 'remove' && provider === 'apple' ? 'filled' : 'plain'}
  />
{/snippet}

<!-- The confirmed step's own action. -->
{#snippet run()}
  {#if verb === 'remove'}
    <button type="button" class="btn preset-filled-error-500 h-12 w-full" disabled={running} onclick={onremove}>
      {m.settings_signInMethodsRemoveProvider({ provider: name })}
    </button>
  {:else}
    <form method="post" action="/auth/oauth/{provider}">
      <input type="hidden" name="intent" value="link" />
      <button type="submit" class="btn preset-filled-primary-500 h-12 w-full">
        {m.settings_signInMethodsAddProvider({ provider: name })}
      </button>
    </form>
  {/if}
{/snippet}

{#snippet relinks()}
  <p class="bg-surface-100-900 rounded-[10px] px-3 py-2.5 text-[13.5px] leading-snug">
    {m.settings_signInMethodsRelinks({ provider: name })}
  </p>
{/snippet}

{#snippet tile()}
  {#if provider === 'apple'}
    <AppleLogo class="h-4.5 w-auto" />
  {:else}
    <GoogleLogo class="size-4.5" />
  {/if}
{/snippet}

{#snippet toggle()}
  {#if identity.linked || configured}
    <button type="button" class={rowAction} disabled={stuck} aria-expanded={open} onclick={ontoggle}>
      {verb === 'remove' ? m.settings_signInMethodsRemove() : m.settings_signInMethodsAdd()}
    </button>
  {/if}
{/snippet}

<div data-provider={provider}>
  <MethodRow
    action={toggle}
    on={identity.linked}
    status={identity.linked ? m.settings_signInMethodsConnected() : m.settings_signInMethodsNotConnected()}
    {tile}
    title={name}
  >
    {#if stuck}
      <p class="text-surface-600-400 -mt-1.5 mr-4 mb-3.5 ml-16 text-[12.5px] leading-snug">
        {m.settings_signInMethodsLastMethod({ provider: name })}
      </p>
    {/if}

    <!-- Local: a step reopened from `?step=` mounts with its row and stays still; only a press slides it in. -->
    {#if open}
      <div in:slide={{ duration: motion(150) }}>
        <ReauthStep
          bind:confirmed
          {action}
          email={page.data.session?.user.email ?? ''}
          inline
          target={provider}
          title={verb === 'remove'
            ? m.settings_signInMethodsConfirmRemove({ provider: name })
            : m.settings_signInMethodsConfirmAdd({ provider: name })}
          note={identity.linked && identity.relinks ? relinks : undefined}
          alternatives={appleAvailable ? withApple : undefined}
          next={verb === 'remove'
            ? m.settings_signInMethodsNowRemove({ provider: name })
            : m.settings_signInMethodsNowAdd({ provider: name })}
          oncancel={ontoggle}
        >
          {@render run()}
        </ReauthStep>
      </div>
    {/if}
  </MethodRow>
</div>
