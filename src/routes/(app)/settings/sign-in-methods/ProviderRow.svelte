<script lang="ts">
  import { page } from '$app/state'
  import ConfirmWithApple from '$lib/auth/ConfirmWithApple.svelte'
  import ReauthStep from '$lib/auth/ReauthStep.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { slide } from 'svelte/transition'

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
  const status = $derived(
    identity.linked ? m.settings_signInMethodsConnected() : m.settings_signInMethodsNotConnected(),
  )
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
    <button type="button" class="btn preset-filled-error-500 w-full" disabled={running} onclick={onremove}>
      {m.settings_signInMethodsRemoveProvider({ provider: name })}
    </button>
  {:else}
    <form method="post" action="/auth/oauth/{provider}">
      <input type="hidden" name="intent" value="link" />
      <button type="submit" class="btn preset-filled-primary-500 w-full">
        {m.settings_signInMethodsAddProvider({ provider: name })}
      </button>
    </form>
  {/if}
{/snippet}

<div data-provider={provider}>
  <div class="flex items-center justify-between gap-4 p-4">
    <span class="min-w-0">
      {name}
      <span class="text-surface-600-400 block text-xs">
        {status}
      </span>
      {#if stuck}
        <span class="text-surface-600-400 block text-xs">{m.settings_signInMethodsLastMethod()}</span>
      {/if}
    </span>
    {#if identity.linked || configured}
      <button
        type="button"
        class="btn btn-sm preset-tonal flex-none"
        disabled={stuck}
        aria-expanded={open}
        onclick={ontoggle}
      >
        {verb === 'remove' ? m.settings_signInMethodsRemove() : m.settings_signInMethodsAdd()}
      </button>
    {/if}
  </div>

  <!-- Local: a step reopened from `?step=` mounts with its row and stays still; only a press slides it in. -->
  {#if open}
    <div class="space-y-3 px-4 pb-4" in:slide={{ duration: motion(150) }}>
      {#if identity.linked && identity.relinks}
        <p class="text-surface-600-400 text-sm">{m.settings_signInMethodsRelinks({ provider: name })}</p>
      {/if}
      <ReauthStep
        bind:confirmed
        {action}
        email={page.data.session?.user.email ?? ''}
        target={provider}
        alternatives={appleAvailable ? withApple : undefined}
      />
      {#if confirmed}
        {@render run()}
      {/if}
    </div>
  {/if}
</div>
