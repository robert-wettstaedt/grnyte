/** The part of the proof-of-work widget the hold drives. */
export interface SolvingWidget {
  reset: () => void
  verify: () => Promise<unknown>
}

/**
 * Holds the form's submits until the widget inside `wrapper` has a solve, then sends them. Every
 * submit that goes out is followed by a fresh solve, since the server spends one even when it
 * refuses the submit for another reason. Returns the teardown.
 */
export function holdUntilSolved(wrapper: HTMLElement, widget: () => null | SolvingWidget): () => void {
  const form = wrapper.closest('form')
  if (form == null) return () => {}

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
  // In the widget's `onload` mode a submit during the solve fails validation on its hidden checkbox.
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
