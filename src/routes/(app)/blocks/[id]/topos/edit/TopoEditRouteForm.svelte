<script lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { routeActionSchema, type RouteDetail } from '$lib/entities/route/dto'
  import { routeEditSeed } from '$lib/entities/route/editSeed'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/writes'
  import FormError from '$lib/forms/FormError.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { FAILURE_TOAST_MS, toaster } from '$lib/state/toast'
  import { untrack } from 'svelte'

  interface Props {
    block: BlockDetail
    /** Close the surface. Only called after a submit resolves successfully. */
    onSaved: () => void
    /** A save is in flight, for the caller's Save button. */
    pending?: boolean
    /** Hydrated: the caller does not mount this until the related rows are local. */
    route: RouteDetail
  }

  let { block, onSaved, pending = $bindable(false), route }: Props = $props()

  // The caller mounts this per open and per route, so one seed at init covers both.
  const store = createFormStore(routeActionSchema)
  untrack(() => store.fields.set(routeEditSeed(route)))

  // `updateRoute` names the route screen; this surface stays put and ignores it. A toast rather
  // than the full-screen offline tile, because the error boundary would take the unsaved lines.
  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    pending = true
    try {
      const outcome = await store.submit(updateRoute)
      if (outcome.kind === 'offline') {
        toaster.create({ duration: FAILURE_TOAST_MS, title: m.error_offline_title(), type: 'warning' })
      } else if (outcome.kind === 'done') {
        onSaved()
      }
    } finally {
      pending = false
    }
  }
</script>

<form id="topo-edit-route-form" class="space-y-4" oninput={store.capture} onsubmit={save}>
  <FormError form={store} />

  <RouteFormFields allowMedia={false} {block} form={store} {route} />
</form>
