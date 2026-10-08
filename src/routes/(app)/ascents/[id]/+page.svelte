<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import SkeletonRows from '$lib/components/Skeleton/SkeletonRows.svelte'
  import { ascentDetail } from '$lib/entities/ascent/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back, redirectTo } from '$lib/state/navigation.svelte'

  const ascent = ascentDetail(() => Number(page.params.id))

  // Pure redirect: an ascent lives as a row in the route's ascent list, so this route resolves
  // routeFk and forwards. `redirectTo`, not `replaceUrl`, so the list keeps the row it scrolls to.
  $effect(() => {
    const data = ascent.data
    if (data == null) return
    const url = `${resolve('/(app)/routes/[id]/ascents', { id: String(data.routeFk) })}?ascent=${data.id}`

    void redirectTo(url)
  })
</script>

<svelte:head>
  <title>{m.ascents_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- A header while it resolves, so a link that never resolves still has a way back. -->
<PageHeader onback={() => back(resolve('/(app)/(shell)/feed'))} title={m.ascents_title()} />

<div class="mx-auto w-full max-w-screen-sm px-4 py-4">
  <QueryState notFound={m.ascents_notFound()} resource={ascent}>
    {#snippet ready(_detail)}
      <!-- The effect above is already navigating away; hold the loading look. -->
      <SkeletonRows count={1} />
    {/snippet}
  </QueryState>
</div>
