<script lang="ts">
  import type { ReauthAction } from '$lib/auth'
  import ConfirmWithApple from './ConfirmWithApple.svelte'
  import ReauthStep from './ReauthStep.svelte'

  // A screen's use of ReauthStep: keyed on action and target, inside its <form>, `require()` on a refusal.
  interface Props {
    action: ReauthAction
    /** Passes "Confirm with Apple" as the alternative, as a screen does for an Apple-linked account. */
    apple?: boolean
    onformsubmit: () => void
    ready?: boolean
    target: string
  }

  let { action, apple = false, onformsubmit, ready = true, target }: Props = $props()

  let confirmed = $state(false)
  let step: ReauthStep | undefined = $state()
</script>

{#snippet withApple()}
  <ConfirmWithApple {action} {target} returnTo="/regions/1/delete" />
{/snippet}

<form
  onsubmit={(event) => {
    event.preventDefault()
    onformsubmit()
  }}
>
  {#key `${action}:${target}`}
    <ReauthStep
      bind:this={step}
      bind:confirmed
      {action}
      {target}
      {ready}
      email="sam@posteo.de"
      alternatives={apple ? withApple : undefined}
    />
  {/key}
  <output data-testid="confirmed">{confirmed}</output>
  <button type="button" onclick={() => step?.require()}>require</button>
</form>
