<script lang="ts">
  import { resolve } from '$app/paths'
  import { onMount } from 'svelte'
  import type { Attachment } from 'svelte/attachments'

  interface AltchaWidget extends HTMLElement {
    reset: () => void
    verify: () => Promise<unknown>
  }

  // Human-interaction signals off: pointer and typing telemetry is profiling, and not needed for the work.
  const configuration = JSON.stringify({ hideFooter: true, hideLogo: true, humanInteractionSignature: false })

  let loaded = $state(false)

  // The custom element touches `window` when it registers, so it is loaded in the browser only.
  onMount(async () => {
    await import('altcha')
    loaded = true
  })

  // On the wrapper, so a submit is held from the first render, before the widget script has loaded.
  // Held submits go out once a solve is in; each one that goes out is followed by a fresh solve,
  // because the server spends it even when it refuses the submit for another reason.
  const holdUntilSolved: Attachment<HTMLElement> = (wrapper) => {
    const form = wrapper.closest('form')
    if (form == null) return

    const widget = () => wrapper.querySelector<AltchaWidget>('altcha-widget')
    let state = 'unverified'
    let held = false

    const hold = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      held = true
      // Expired and error are resting states too; only a solve already running needs no nudge.
      if (state !== 'verifying') void widget()?.verify()
    }
    const onSubmit = (event: Event) => {
      if (state !== 'verified') {
        hold(event)
        return
      }
      // After the form has read the payload out of this submit.
      setTimeout(() => {
        state = 'unverified'
        widget()?.reset()
        void widget()?.verify()
      })
    }
    const onInvalid = (event: Event) => {
      if (event.target instanceof Node && wrapper.contains(event.target)) hold(event)
    }
    const onStateChange = (event: Event) => {
      state = (event as CustomEvent<{ state: string }>).detail.state
      if (state === 'verified' && held) {
        held = false
        form.requestSubmit()
      }
    }

    // Capture, so this runs before the remote form's own submit handler on the same element.
    form.addEventListener('submit', onSubmit, true)
    form.addEventListener('invalid', onInvalid, true)
    wrapper.addEventListener('statechange', onStateChange, true)
    return () => {
      form.removeEventListener('submit', onSubmit, true)
      form.removeEventListener('invalid', onInvalid, true)
      wrapper.removeEventListener('statechange', onStateChange, true)
    }
  }
</script>

<span class="contents" {@attach holdUntilSolved}>
  {#if loaded}
    <altcha-widget
      challenge={resolve('/auth/challenge')}
      auto="onload"
      display="invisible"
      name="altcha"
      {configuration}
    ></altcha-widget>
  {/if}
</span>
