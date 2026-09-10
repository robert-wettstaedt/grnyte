<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import BlockForm from '$lib/entities/block/BlockForm.svelte'
  import { setBlockLocation, updateBlock } from '$lib/entities/block/blocks.remote'
  import { canEditBlock } from '$lib/entities/block/permissions'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

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
  // The block's immediate area (last crumb) is the crag the form frames against.
  const area = areaDetail(() => block.data?.areas.at(-1)?.id ?? -1)

  // Keyed on the loaded row's id and not the route parameter: the seed reads data, so it has to
  // wait for the row rather than write the previous entity's values under the new id. Re-seeding
  // on every snapshot would clobber edits in progress, which is what the guard is for.
  seedOnKeyChange(
    () => block.data?.id,
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

<QueryState resource={block}>
  {#snippet ready(detail)}
    <!-- flex-1: nested inside the block QueryState, whose wrapper has no definite height for
         this one's `min-h-full` to resolve against. Without it the map picker collapses. -->
    <QueryState resource={area} class="flex-1">
      {#snippet ready(crag)}
        {#if canEditBlock(global.userRegions, detail)}
          <!-- `seedKey` and not `{#key}`: BlockForm re-seeds its own pin when the id changes,
               so the `<form>` it owns is never destroyed and rebuilt under the remote form
               object, which accepts only one element at a time. -->
          <BlockForm
            seedKey={detail.id}
            area={crag}
            editing
            form={updateBlock}
            {initialStep}
            initialLocation={detail.geolocation == null
              ? null
              : { lat: detail.geolocation.lat, long: detail.geolocation.long }}
            initialEstimated={detail.geolocation?.estimated ?? false}
            onCancel={() => back(resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(detail.id) }))}
            onLocationCommit={initialStep === 'pin'
              ? (coords) => void runCommand(setBlockLocation({ id: detail.id, lat: coords.lat, long: coords.long }))
              : undefined}
            submitLabel={m.common_save()}
            {title}
          />
        {:else}
          <ErrorState type="notfound" title={m.blocks_notFound()} />
        {/if}
      {/snippet}
    </QueryState>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.blocks_notFound()} />
  {/snippet}
</QueryState>
