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
  import { runCommand } from '$lib/remote/mutation'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  // Shared body for the two block-editor routes: /edit opens on the form, /move jumps
  // straight to the map picker. Both submit `updateBlock`, so the form must carry the
  // current name + location even on /move, or saving after a pin nudge would wipe them.
  interface Props {
    title: string
    initialStep?: 'form' | 'pin'
  }

  const { title, initialStep = 'form' }: Props = $props()

  const global = getGlobalState()
  const block = blockDetail(() => Number(page.params.id))
  // The block's immediate area (last crumb) is the crag the form frames against.
  const area = areaDetail(() => block.data?.areas.at(-1)?.id ?? -1)

  // Prefill once per block; reading live data on every change would clobber the user's edits.
  let prefilledId: number | undefined
  $effect(() => {
    const data = block.data
    if (data != null && data.id !== prefilledId) {
      prefilledId = data.id
      updateBlock.fields.set({ id: String(data.id), name: data.rawName })
    }
  })
</script>

<svelte:head>
  <title>{title} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={block}>
  {#snippet ready(detail)}
    <QueryState resource={area}>
      {#snippet ready(crag)}
        {#if canEditBlock(global.userRegions, detail)}
          <BlockForm
            area={crag}
            editing
            form={updateBlock}
            {initialStep}
            initialLocation={detail.geolocation == null
              ? null
              : { lat: detail.geolocation.lat, long: detail.geolocation.long }}
            onCancel={() => back(resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(detail.id) }))}
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
