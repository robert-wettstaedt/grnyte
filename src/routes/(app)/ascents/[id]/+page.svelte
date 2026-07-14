<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { ascentDetail } from '$lib/entities/ascent/resources.svelte'
  import { m } from '$lib/paraglide/messages'

  const ascent = ascentDetail(() => Number(page.params.id))

  // Pure redirect: an ascent's canonical surface is its row in the route's ascent
  // list, so this route only resolves routeFk and forwards; ?ascent= makes the list
  // highlight and scroll to the row. replaceState keeps back from bouncing here.
  $effect(() => {
    const data = ascent.data
    if (data == null) return
    const url = `${resolve('/(app)/routes/[id]/ascents', { id: String(data.routeFk) })}?ascent=${data.id}`
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve() plus a query param.
    void goto(url, { replaceState: true })
  })
</script>

<svelte:head>
  <title>{m.ascents_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={ascent}>
  {#snippet ready(_detail)}
    <!-- The effect above is already navigating away; hold the loading look. -->
    <div class="space-y-4 px-4 py-4" aria-busy="true">
      <div class="placeholder animate-pulse"></div>
    </div>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.ascents_notFound()} />
  {/snippet}
</QueryState>
