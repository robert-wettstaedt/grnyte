/**
 * Catches the navigation a handler's `redirectTo` becomes, so the caller can leave its own way.
 *
 * A `redirectTo` reaches the client as a 303, which Kit's remote-form client applies as a PUSHING
 * `goto` from inside `submit()`. A form that wants to retire its own screen has to take that
 * destination rather than let the push happen.
 *
 * TEMPORARY, by design. Once `authedForm` stops redirecting, nothing raises a redirect to catch and
 * this module plus its one use in `Form.svelte` goes. It lives behind its own seam so that removal
 * is a deletion rather than unpicking state from a submit handler.
 */

/** The half of Kit's `BeforeNavigate` this needs. Narrowed so a test can build one. */
export interface CapturedNavigation {
  cancel: () => void
  from?: null | { url: URL }
  to?: null | { url: URL }
  type: string
}

export interface RedirectCapture {
  /** Run `submit` with the capture armed, disarming once the redirect has had its chance. */
  around: <T>(submit: () => Promise<T>) => Promise<T>
  /** The destination caught during the last {@link around}, taken once. */
  take: () => string | undefined
}

/**
 * @param register hands the handler to `beforeNavigate`; a test hands it a fake.
 * @param currentPath the screen that is submitting, so a link the reader taps is left alone.
 * @param settle waits for the redirect to reach `beforeNavigate` (`tick` in a component).
 */
export function createRedirectCapture(
  register: (handler: (navigation: CapturedNavigation) => void) => void,
  currentPath: () => string,
  settle: () => Promise<void>,
): RedirectCapture {
  let armed = false
  let caught: string | undefined

  register((navigation) => {
    if (!armed || navigation.type !== 'goto' || navigation.to == null) return

    // Only a navigation leaving the screen that submitted. A link the reader taps mid-submit is
    // theirs, and cancelling it would strand them.
    if (navigation.from?.url.pathname !== currentPath()) return

    caught = navigation.to.url.pathname + navigation.to.url.search
    navigation.cancel()
  })

  return {
    async around(submit) {
      armed = true
      caught = undefined

      try {
        return await submit()
      } finally {
        // Settle first, because the redirect is raised from inside `submit` and reaches the handler
        // a tick later. Disarm immediately after, and never later: held open across the caller's
        // own navigation it cancels that too, which silently turned every page-issued push into a
        // pop until it was caught by an e2e assertion on the history entry count.
        await settle()
        armed = false
      }
    },

    take() {
      const destination = caught
      caught = undefined
      return destination
    },
  }
}
