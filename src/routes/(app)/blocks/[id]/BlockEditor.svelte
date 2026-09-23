<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import BlockForm from '$lib/entities/block/BlockForm.svelte'
  import { setBlockLocation, updateBlock } from '$lib/entities/block/blocks.remote'
  import { canEditBlock } from '$lib/entities/block/permissions'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { isOnline } from '$lib/state/online.svelte'
  import { notifyError } from '$lib/state/toast'

  // Shared body for the two block-editor routes: /edit opens on the form, /move jumps
  // straight to the map picker. Both submit `updateBlock`, so the form must carry the
  // current name + location even on /move, or saving after a pin nudge would wipe them.
  interface Props {
    initialStep?: 'form' | 'pin'
    title: string
  }

  const { initialStep = 'form', title }: Props = $props()

  const global = getGlobalState()
  const block = blockDetail(() => Number(page.params.id))
  // The block's immediate area (last crumb) is the sector the form frames against.
  const area = areaDetail(() => block.data?.areas.at(-1)?.id ?? -1)

  /**
   * Whether the pin is known to be here, not just the block's own row. A form opened on a partial
   * snapshot stamps a proof claiming there was no pin, and the seed key (the block id) never
   * changes to re-stamp it, so every save refuses until a reload. Unreproduced, kept because that
   * state cannot recover. Worked example: `routes/[id]/edit`.
   *
   * An effect, not a `$derived`: a latch has to remember, or a parked socket tears the form down.
   */
  let hydratedId = $state<number | undefined>()
  $effect(() => {
    const id = block.data?.id
    if (id == null || !block.isComplete || hydratedId === id) return
    hydratedId = id
  })

  // Keyed on the hydrated id and not the route parameter or the raw row: the seed reads data, so it
  // has to wait for the row rather than write the previous entity's values under the new id, and it
  // may as well land at the moment the form appears. Re-seeding on every snapshot would clobber
  // edits in progress, which is what the guard is for.
  seedOnKeyChange(
    () => hydratedId,
    () => {
      const data = block.data
      if (data == null) {
        return
      }
      updateBlock.fields.set({ description: data.description, id: String(data.id), name: data.rawName })
    },
  )
</script>

<svelte:head>
  <title>{title} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState notFound={m.blocks_notFound()} resource={block}>
  {#snippet ready(detail)}
    <!-- flex-1: nested inside the block QueryState, whose wrapper has no definite height for
         this one's `min-h-full` to resolve against. Without it the map picker collapses. -->
    <QueryState notFound={m.areas_notFound()} resource={area} class="flex-1">
      {#snippet ready(sector)}
        {#if !canEditBlock(global.userRegions, detail)}
          <ErrorState
            type="generic"
            title={m.form_noPermissionTitle()}
            description={m.form_noEditPermission()}
            primaryAction={{
              href: entityHref('blocks', detail.id),
              label: m.blocks_viewBlock(),
            }}
          />
        {:else if hydratedId !== detail.id}
          <!-- No form until the pin is here, and outside `BlockForm` so no Save sits over the
               spinner: a submit with no coordinates validly means "remove the pin". -->
          {#if isOnline()}
            <LoadingIndicator class="flex h-full w-full items-center justify-center" size={20} />
          {:else}
            <!-- Offline the pin is not coming, so the spinner would never resolve. `QueryState`
                 cannot answer this: the block's own row is local, so it reads 'ready'. -->
            <OfflineNotice />
          {/if}
        {:else}
          <!-- `seedKey` and not `{#key}`: BlockForm re-seeds its own pin when the id changes,
               so the `<form>` it owns is never destroyed and rebuilt under the remote form
               object, which accepts only one element at a time. -->
          <BlockForm
            seedKey={detail.id}
            area={sector}
            editing
            form={updateBlock}
            {initialStep}
            initialLocation={detail.geolocation == null
              ? null
              : { lat: detail.geolocation.lat, long: detail.geolocation.long }}
            initialEstimated={detail.geolocation?.estimated ?? false}
            cancelTo={entityHref('blocks', detail.id)}
            onLocationCommit={initialStep === 'pin'
              ? // Not `withUndo`, so the failure has to be reported here.
                (coords) =>
                  void runCommand(setBlockLocation({ id: detail.id, lat: coords.lat, long: coords.long })).catch(
                    notifyError,
                  )
              : undefined}
            submitLabel={m.common_save()}
            {title}
          />
        {/if}
      {/snippet}
    </QueryState>
  {/snippet}
</QueryState>
