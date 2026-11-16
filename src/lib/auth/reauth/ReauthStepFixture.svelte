<script lang="ts">
  import type { ReauthAction } from '$lib/auth'
  import ReauthStep from './ReauthStep.svelte'

  // A screen's use of ReauthStep: keyed on action and target, inside its <form>, `require()` on a refusal.
  interface Props {
    action: ReauthAction
    onformsubmit: () => void
    ready?: boolean
    target: string
  }

  let { action, onformsubmit, ready = true, target }: Props = $props()

  let confirmed = $state(false)
  let step: ReauthStep | undefined = $state()
</script>

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
      returnTo="/regions/1/delete"
    />
  {/key}
  <output data-testid="confirmed">{confirmed}</output>
  <button type="button" onclick={() => step?.require()}>require</button>
</form>
