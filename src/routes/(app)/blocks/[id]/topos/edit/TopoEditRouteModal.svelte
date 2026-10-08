<script lang="ts">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import { updateRoute } from '$lib/entities/route/routes.remote'
  import { m } from '$lib/paraglide/messages'
  import { isOnline } from '$lib/state/online.svelte'
  import { toaster } from '$lib/state/toast'
  import TopoEditRouteForm from './TopoEditRouteForm.svelte'

  interface Props {
    block: BlockDetail
    open: boolean
    routeId: number | undefined
  }

  let { block, open = $bindable(), routeId }: Props = $props()

  const route = routeDetail(() => routeId ?? -1, { enabled: () => open && routeId != null })

  // Disabling on close resets `settled`, and a reopen usually settles in the same flush anyway
  // because the view is hash-cached and still complete. Either way it never seeds from a partial.
  const detail = $derived(route.phase.kind === 'answered' ? route.data : undefined)

  function onSaved() {
    open = false
    toaster.create({ title: m.common_saved(), type: 'success' })
  }
</script>

<!-- Supplying `headerRight` replaces Modal's own close trigger, so the surface has to bring one
     back: Escape is not a control a touch device has. Same arrow-left as the add sheet's step 2,
     because from the reader's side both dismiss a form opened over the editor. Both snippets are
     passed unconditionally and Save is disabled until the route is hydrated, because dropping
     `headerRight` while it loads hands the slot back to Modal's own close and the header briefly
     shows two of them. -->
{#snippet back()}
  <button
    class="btn-icon preset-filled-surface-200-800 shrink-0"
    type="button"
    aria-label={m.common_back()}
    onclick={() => (open = false)}
  >
    <Icon name="arrow-left" />
  </button>
{/snippet}

{#snippet save()}
  <button
    class="btn-icon preset-filled-primary-500 shrink-0"
    type="submit"
    form="topo-edit-route-form"
    aria-label={m.common_save()}
    disabled={detail == null || updateRoute.pending > 0}
  >
    <Icon name="check" />
  </button>
{/snippet}

<!-- Same geometry as the add modal, so the editor keeps one surface shape. No trigger: the route
     card owns the button, and the keyboard opens it too. -->
<Modal
  bind:open
  title={m.topo_editRoute()}
  backdrop
  panel
  panelClass="fixed inset-y-0 right-0 z-50"
  contentClass="h-full w-94 rounded-none border-y-0 border-r-0 lg:w-105"
  snapPoints={[0.9]}
  headerLeft={back}
  headerRight={save}
>
  <!-- Mounted per open: that is what makes the form seed again on a reopen. -->
  {#if open}
    {#if detail == null}
      {#if route.phase.kind === 'error'}
        <QueryError />
      {:else if route.phase.kind === 'answered'}
        <!-- Answered empty: deleted, possibly by someone else while this was open. -->
        <ErrorState type="notfound" title={m.routes_notFound()} />
      {:else if isOnline()}
        <LoadingIndicator class="flex h-40 w-full items-center justify-center" size={20} />
      {:else}
        <!-- Offline the spinner would never resolve: rows on hand are not the whole route. -->
        <OfflineNotice />
      {/if}
    {:else}
      {#key detail.id}
        <TopoEditRouteForm {block} {onSaved} route={detail} />
      {/key}
    {/if}
  {/if}
</Modal>
