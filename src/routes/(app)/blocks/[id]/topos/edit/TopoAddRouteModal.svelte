<script lang="ts">
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { FaClimber } from '$lib/entities/firstAscensionist/FirstAscentField.svelte'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { routeActionSchema, type RouteListItem } from '$lib/entities/route/dto'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { createRoute } from '$lib/entities/route/writes'
  import FormError from '$lib/forms/FormError.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { motion } from '$lib/state/motion.svelte'
  import { FAILURE_TOAST_MS, toaster } from '$lib/state/toast'
  import { flip } from 'svelte/animate'
  import { fade, slide } from 'svelte/transition'

  /** The block-route-list shape (a subset of RouteListItem): enough for the picker rows. */
  type RouteCandidate = Pick<RouteListItem, 'description' | 'gradeFk' | 'id' | 'name' | 'rating' | 'tags'>

  interface Props {
    block: BlockDetail
    /** Block routes not yet drawn on this photo. */
    candidates: RouteCandidate[]
    /** Add the given route's line to the current photo (and select it for drawing). */
    onAdd: (routeId: number) => void
  }

  const { block, candidates, onAdd }: Props = $props()
  const global = getGlobalState()

  const duration = $derived(motion(150))

  let open = $state(false)
  let query = $state('')
  let newRouteOpen = $state(false)

  // One store per open, so nothing from the last open survives, and it outlives the two steps' forms.
  let store = $state.raw(createFormStore(routeActionSchema))
  let submitting = $state(false)

  // Held here, not in RouteFormFields: stepping Back unmounts it, and these four live in component
  // state. Losing only some of them on the way back is a half-reset that creates a gradeless route.
  let firstAscents = $state<FaClimber[]>()
  let gradeFk = $state<number>()
  let rating = $state<number>()
  let tags = $state<string[]>()

  const filtered = $derived(
    query.trim() === ''
      ? candidates
      : candidates.filter((route) => route.name.toLowerCase().includes(query.trim().toLowerCase())),
  )

  // Open fresh at step 1 every time. Resetting on open (not close) also avoids a flicker
  // where the closing animation would briefly show the reset state.
  function openSheet() {
    query = ''
    newRouteOpen = false
    firstAscents = undefined
    gradeFk = undefined
    rating = undefined
    tags = undefined
    store = createFormStore(routeActionSchema)
    store.fields.set({ blockId: String(block.id) })
    open = true
  }

  // Close before delegating: `onAdd` selects the route, which unmounts the sheet this one is
  // nested in, and a dialog torn down while a nested one deactivates throws out of focus-trap.
  function pick(routeId: number) {
    open = false
    onAdd(routeId)
  }

  // Switching steps re-renders the sheet mid-click; svelte-bottom-sheet's document-level
  // close-on-outside handler then sees a detached event.target (`contains()` is false) and
  // dismisses the whole sheet. Stop the click here so that handler never runs. Svelte registers
  // its delegated click listener at mount, before the sheet's (added ~100ms after it opens), so
  // stopImmediatePropagation from this handler preempts the library's.
  // ponytail: tied to that handler being a bubbling document `click` listener; revisit if the lib
  // switches to pointerdown or exposes a real "don't close" API.
  function setNewRouteOpen(next: boolean, event: Event) {
    event.stopImmediatePropagation()
    newRouteOpen = next
  }

  // Both "Quick line" (step 1) and the new-route form (step 2) create a route; a quick line sends
  // only the block (empty name, no grade), whatever step 2 holds. A toast rather than letting a dead
  // network reach the error boundary, which would replace the editor and take the unsaved lines.
  async function add(event: SubmitEvent, quick: boolean) {
    event.preventDefault()
    if (submitting) return
    submitting = true
    try {
      const outcome = await store.submit((values) => createRoute(quick ? { blockId: values.blockId } : values))
      if (outcome.kind === 'offline') {
        toaster.create({ duration: FAILURE_TOAST_MS, title: m.error_offline_title(), type: 'warning' })
      }
      const id = outcome.kind === 'done' ? outcome.result.data?.id : undefined
      if (id != null) {
        open = false
        onAdd(id)
      }
    } finally {
      submitting = false
    }
  }
</script>

<!-- Declared out here (not inside <Modal>) so `footer` can reference it conditionally without
     Svelte implicitly binding it as a Modal prop or using it before declaration. -->
{#snippet stepOneFooter()}
  <!-- Pinned as the sheet footer so it stays reachable without scrolling past the route list. -->
  <form class="w-full space-y-3" onsubmit={(event) => add(event, true)}>
    <FormError form={store} />

    <p class="text-surface-600-400 text-center text-xs font-bold tracking-wide uppercase">{m.topo_orCreateNew()}</p>

    <div class="grid grid-cols-2 gap-2">
      <button
        class="preset-tonal-surface border-surface-200-800 rounded-xl border p-3 text-left"
        type="submit"
        disabled={submitting}
      >
        <span class="block text-sm font-bold">{m.topo_quickLine()}</span>
        <span class="text-surface-600-400 mt-0.5 block text-xs">{m.topo_quickLineSub()}</span>
      </button>

      <button
        class="preset-tonal-primary border-primary-500/40 rounded-xl border p-3 text-left"
        type="button"
        onclick={(event) => setNewRouteOpen(true, event)}
      >
        <span class="block text-sm font-bold">{m.topo_newRoute()}</span>
        <span class="mt-0.5 block text-xs opacity-80">{m.topo_newRouteSub()}</span>
      </button>
    </div>
  </form>
{/snippet}

<!-- Step 2 lives in the sheet header (outside the form): Back on the left, save-as-check on the
     right in place of the default close button. The check submits the form via its `form` id. -->
{#snippet stepTwoBack()}
  <button
    class="btn-icon preset-filled-surface-200-800 shrink-0"
    type="button"
    aria-label={m.common_back()}
    onclick={(event) => setNewRouteOpen(false, event)}
  >
    <Icon name="arrow-left" />
  </button>
{/snippet}

{#snippet stepTwoSave()}
  <button
    class="btn-icon preset-filled-primary-500 shrink-0"
    type="submit"
    form="topo-new-route-form"
    aria-label={m.common_add()}
    disabled={submitting}
  >
    <Icon name="check" />
  </button>
{/snippet}

<!-- Desktop: overlay the routes panel exactly (same position/size, one z above) so it fully
     covers it instead of floating beside it. Mobile: opened from inside the routes sheet, so Modal
     stacks it over that one. Either way only one surface is ever visible. -->
<Modal
  bind:open
  title={newRouteOpen ? m.topo_newRoute() : m.topo_addRouteToPhoto()}
  backdrop
  panel
  panelClass="fixed inset-y-0 right-0 z-50"
  contentClass="h-full w-94 rounded-none border-y-0 border-r-0 lg:w-105"
  snapPoints={[0.9]}
  footer={newRouteOpen ? undefined : stepOneFooter}
  headerLeft={newRouteOpen ? stepTwoBack : undefined}
  headerRight={newRouteOpen ? stepTwoSave : undefined}
>
  {#snippet trigger(props)}
    <button {...props} class="btn preset-filled-primary-500 h-11 w-full" type="button" onclick={openSheet}>
      <Icon name="plus" size={18} />
      {m.topo_addRouteToPhoto()}
    </button>
  {/snippet}

  <!-- `in:` only on both steps: an out-fade would keep the outgoing step in the layout while the
       incoming one is already there, which shifts the sheet mid-swap. -->
  {#if newRouteOpen}
    <!-- Step 2: the full new-route form fills the sheet. Same fields as everywhere else, minus the
         media picker: this screen already owns a photo upload of its own. -->
    <form
      id="topo-new-route-form"
      class="space-y-4"
      oninput={store.capture}
      onsubmit={(event) => add(event, false)}
      in:fade={{ duration }}
    >
      <FormError form={store} />

      <RouteFormFields allowMedia={false} {block} bind:firstAscents form={store} bind:gradeFk bind:rating bind:tags />
    </form>
  {:else}
    <!-- Step 1: pick an existing route to draw on this photo. -->
    <!-- ponytail: pb clears the mobile sheet's *fixed* footer (~120px); Modal's own pb-20 is too
         small. On desktop the panel footer is a normal flex row (not fixed), so no clearance needed.
         Bump if the footer grows. -->
    <div class="space-y-2 pb-36 md:pb-0" in:fade={{ duration }}>
      <div class="relative">
        <input
          class="input h-11 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
          type="search"
          placeholder={m.topo_searchRoutes()}
          bind:value={query}
        />
        {#if query}
          <button
            class="btn-icon absolute inset-y-0 right-1 my-auto"
            type="button"
            aria-label={m.common_clear()}
            onclick={() => (query = '')}
          >
            <Icon name="close" size={14} />
          </button>
        {/if}
      </div>

      {#if filtered.length === 0}
        <p class="text-surface-600-400 py-4 text-center text-sm">{m.topo_selectRoutePrompt()}</p>
      {:else}
        <!-- No inner max-height/scroll: the sheet (mobile) and panel body (desktop) already scroll.
             A cap here would truncate the list mid-panel with dead space below. -->
        <nav class="flex flex-col gap-1.5">
          {#each filtered as route (route.id)}
            <div transition:slide={{ duration }} animate:flip={{ duration }}>
              <RouteRow
                {route}
                grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
                onclick={() => pick(route.id)}
              />
            </div>
          {/each}
        </nav>
      {/if}
    </div>
  {/if}
</Modal>
