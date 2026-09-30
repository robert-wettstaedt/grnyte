<script lang="ts">
  import { resolve } from '$app/paths'
  import type { RemoteFormField } from '@sveltejs/kit'
  import { onMount } from 'svelte'
  import { PROOF_OF_WORK_FIELD } from './botCheck'
  import { holdUntilSolved, type SolvingWidget } from './submitHold'

  /** The anonymous form's fields; its schema spreads `botFields`. */
  const { fields }: { fields: { hpcheck: RemoteFormField<string> } } = $props()

  // Human-interaction signals off: pointer and typing telemetry is profiling, and not needed for the work.
  const configuration = JSON.stringify({ hideFooter: true, hideLogo: true, humanInteractionSignature: false })

  let loaded = $state(false)

  // The custom element touches `window` when it registers, so it is loaded in the browser only.
  onMount(async () => {
    await import('altcha')
    loaded = true
  })
</script>

<!-- Off-screen, not type=hidden: bots skip hidden inputs. The data-* opt password managers out. -->
<div class="honeypot" aria-hidden="true">
  <input
    {...fields.hpcheck.as('text')}
    autocomplete="off"
    tabindex="-1"
    data-1p-ignore
    data-lpignore="true"
    data-bwignore
    data-form-type="other"
  />
</div>

<!-- On the wrapper, so a submit is held from the first render, before the widget script has loaded. -->
<span
  class="contents"
  {@attach (wrapper) => holdUntilSolved(wrapper, () => wrapper.querySelector<Element & SolvingWidget>('altcha-widget'))}
>
  {#if loaded}
    <altcha-widget
      challenge={resolve('/auth/challenge')}
      auto="onload"
      display="invisible"
      name={PROOF_OF_WORK_FIELD}
      {configuration}
    ></altcha-widget>
  {/if}
</span>

<style>
  .honeypot {
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
</style>
