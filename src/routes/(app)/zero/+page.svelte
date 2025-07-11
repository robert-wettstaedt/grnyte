<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
</script>

<svelte:window />

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="-m-[0.5rem] md:-m-[1rem]" use:fitHeightAction={{ paddingBottom: 0 }}>
  {#await import('$lib/components/BlocksMap/ZeroLoader.svelte') then BlocksMap}
    <BlocksMap.default />
  {/await}
</div>
