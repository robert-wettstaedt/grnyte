<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { ascentDetail } from '$lib/entities/ascent/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { redirectTo } from '$lib/state/navigation.svelte'

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

<QueryState notFound={m.ascents_notFound()} resource={ascent}>
  {#snippet ready(_detail)}
    <!-- The effect above is already navigating away; hold the loading look. -->
    <div class="space-y-4 px-4 py-4" aria-busy="true">
      <div class="placeholder animate-pulse"></div>
    </div>
  {/snippet}
</QueryState>
