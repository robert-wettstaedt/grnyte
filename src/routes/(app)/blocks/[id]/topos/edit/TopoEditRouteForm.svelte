<script lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { routeActionSchema, type RouteDetail } from '$lib/entities/route/dto'
  import { routeEditSeed } from '$lib/entities/route/editSeed'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/writes'
  import FormError from '$lib/forms/fields/FormError.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { untrack } from 'svelte'
  import { showSubmitFailure } from './submitFailure'

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

  // `updateRoute` names the route screen; this surface stays put and ignores it.
  async function save(event: SubmitEvent) {
    event.preventDefault()
    const element = event.currentTarget as HTMLFormElement
    if (pending) return
    pending = true
    try {
      const outcome = await store.submit(updateRoute)
      if (outcome.kind === 'done') onSaved()
      else showSubmitFailure(element, outcome.kind)
    } finally {
      pending = false
    }
  }
</script>

<form id="topo-edit-route-form" class="space-y-4" oninput={store.capture} onsubmit={save}>
  <FormError form={store} />

  <RouteFormFields allowMedia={false} {block} form={store} {route} />
</form>
