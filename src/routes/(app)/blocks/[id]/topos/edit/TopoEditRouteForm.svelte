<script lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { RouteDetail } from '$lib/entities/route/dto'
  import { routeEditSeed } from '$lib/entities/route/editSeed'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/routes.remote'
  import FormError from '$lib/forms/FormError.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { submitForm } from '$lib/forms/submit'
  import { m } from '$lib/paraglide/messages'
  import { FAILURE_TOAST_MS, toaster } from '$lib/state/toast'

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
      // No DOM reset: it blanks the rendered name, and the `fields.set` below then writes the value
      // the singleton already holds, so nothing re-renders and an empty name submits over a real
      // one. Cost is that Kit's issues survive a reopen, and unlike `/routes/[id]/edit` this
      // surface never reloads, so a stale guard error stays on screen until the next submit.
      updateRoute.fields.set(routeEditSeed(route))
    },
  )

  // Passing our own callback replaces Kit's, which is what would otherwise clear the form. This
  // surface reopens rather than navigating away, so the seed above clears it instead.
  // `updateRoute` declares a `redirectTo` for the route screen; this surface stays put and ignores
  // it. A toast rather than the full-screen offline tile, because letting a dead network reach the
  // error boundary would replace the editor and take the unsaved lines with it.
  const submit = updateRoute.enhance(async ({ submit }) => {
    if ((await submitForm(submit, onSaved)) === 'offline') {
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
