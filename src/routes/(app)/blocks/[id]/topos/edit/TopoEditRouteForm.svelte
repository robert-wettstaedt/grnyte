<script lang="ts">
  import { beforeNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { RouteDetail } from '$lib/entities/route/dto'
  import { routeListsFingerprint } from '$lib/entities/route/fingerprint'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/routes.remote'
  import FormError from '$lib/forms/FormError.svelte'
  import { isOfflineFailure } from '$lib/forms/offlineFailure'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { isOnline } from '$lib/state/online.svelte'
  import { createRedirectCapture } from '$lib/state/redirectCapture.svelte'
  import { FAILURE_TOAST_MS, toaster } from '$lib/state/toast'
  import { tick } from 'svelte'

  interface Props {
    block: BlockDetail
    /** Close the surface. Only called after a submit resolves successfully. */
    onSaved: () => void
    /** Hydrated: the caller does not mount this until the related rows are local. */
    route: RouteDetail
  }

  const { block, onSaved, route }: Props = $props()

  // Mounted per open, so this seeds on every open rather than only when the route changes.
  seedOnKeyChange(
    () => route.id,
    () => {
      // No DOM reset here, deliberately. `reset()` restores every input to its `defaultValue`,
      // which blanks the rendered name; the `fields.set` below then writes the value the singleton
      // ALREADY held from the previous open, so Svelte sees no change, never re-renders, and the
      // form submits an empty name over a real one. Reopening the same route is the case that hits
      // it. Kit's issues therefore survive a reopen, the documented limit of `seedOnKeyChange`, and
      // the same trade `/routes/[id]/edit` makes.
      updateRoute.fields.set({
        blockId: String(route.blockFk),
        description: route.description,
        firstAscentYear: route.firstAscentYear == null ? '' : String(route.firstAscentYear),
        id: String(route.id),
        known: routeListsFingerprint(route.tags, route.firstAscents),
        name: route.rawName,
      })
    },
  )

  // `updateRoute`'s `redirectTo` reaches the client as a 303 that Kit applies as a push to the
  // route screen. Right for that form, wrong here: it would leave the editor and take the unsaved
  // lines with it. Caught and dropped, because this surface stays put.
  const capture = createRedirectCapture(beforeNavigate, () => page.url.pathname, tick)

  // Passing our own callback replaces Kit's, which is what would otherwise clear the form. This
  // surface reopens rather than navigating away, so the seed above clears it instead.
  const submit = updateRoute.enhance(async ({ submit }) => {
    try {
      const ok = await capture.around(submit)
      capture.take()
      if (ok) {
        onSaved()
      }
    } catch (cause) {
      // Rethrowing reaches the error boundary, which replaces the whole editor and takes the
      // unsaved lines with it. A dead network is not worth that, so it stays a toast. Named
      // copy, not `notifyError`: a fetch TypeError carries no server message and resolves to
      // the generic error title, which does not tell anyone their connection is the problem.
      if (!isOfflineFailure(cause, isOnline())) throw cause
      toaster.create({ duration: FAILURE_TOAST_MS, title: m.error_offline_title(), type: 'warning' })
    }
  })
</script>

<form {...submit} id="topo-edit-route-form" class="space-y-4">
  <FormError form={updateRoute} />

  <!-- Only rendered fields are submitted, so `fields.set` alone would leave `known` out. -->
  <input type="hidden" {...updateRoute.fields.known.as('text')} />

  <RouteFormFields allowMedia={false} {block} form={updateRoute} {route} />
</form>
