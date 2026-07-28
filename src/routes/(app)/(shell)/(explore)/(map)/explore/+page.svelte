<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  // The safety net for every lost-invite path: an account that signed up but never joined (a
  // different address than the invited one, an invitation that timed out mid-signup, a link never
  // reopened) otherwise lands on an empty map with no explanation. authGuard sends them to the
  // invitation instead when their address still has a live one, so reaching this means there is
  // nothing left to accept.
  const global = getGlobalState()
</script>

<svelte:head>
  <title>{m.explore_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if global.userRegions.length === 0}
  <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
    <div class="card preset-filled-surface-100-900 pointer-events-auto max-w-sm px-6 py-7 text-center shadow-xl">
      <h2 class="text-surface-950-50 mb-2 text-xl font-bold tracking-tight">{m.explore_noRegionTitle()}</h2>
      <p class="text-surface-600-400 text-pretty">{m.explore_noRegionBody()}</p>
    </div>
  </div>
{/if}
