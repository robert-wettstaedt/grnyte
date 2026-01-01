<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
</script>

<AppBar class="sticky top-0 z-50 p-2 shadow-xl">
  <AppBar.Toolbar class="grid-cols-[1fr_auto]">
    <AppBar.Lead>
      <a class="flex gap-2" href="/">
        <img src={Logo} alt={PUBLIC_APPLICATION_NAME} width={32} height={32} />

        <strong class="text-xl">{PUBLIC_APPLICATION_NAME}</strong>
      </a>
    </AppBar.Lead>

    {#if page.data.session?.user == null}
      <AppBar.Trail>
        <a href="/auth" class="btn btn-sm preset-filled-primary-500"> Get Started </a>
      </AppBar.Trail>
    {/if}
  </AppBar.Toolbar>
</AppBar>
