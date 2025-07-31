<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
</script>

<AppBar classes="sticky top-0 z-50 shadow-xl" padding="p-2">
  {#snippet lead()}
    <a class="flex gap-2" href="/">
      <img src={Logo} alt={PUBLIC_APPLICATION_NAME} width={32} height={32} />

      <strong class="text-xl">{PUBLIC_APPLICATION_NAME}</strong>
    </a>
  {/snippet}

  {#snippet trail()}
    {#if page.data.session?.user == null}
      <a href="/auth" class="btn btn-sm preset-filled-primary-500"> Get Started </a>
    {/if}
  {/snippet}
</AppBar>
