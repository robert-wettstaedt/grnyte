<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import Landing from '$lib/components/Landing'
  import { pageState } from '$lib/components/Layout'
  import NewUserCard from '$lib/components/NewUserCard'

  const { data } = $props()
</script>

<svelte:window />

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if data.session == null}
  <Landing />
{:else if pageState.userRegions.length > 0}
  <div class="-m-[0.5rem] md:-m-[1rem]" use:fitHeightAction={{ paddingBottom: 0 }}>
    {#await import('$lib/components/BlocksMap/ZeroLoader.svelte') then BlocksMap}
      <BlocksMap.default />
    {/await}
  </div>
{:else}
  <NewUserCard />
{/if}
