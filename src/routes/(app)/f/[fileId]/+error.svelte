<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import Error from '$lib/components/Error'

  const errorMessage = $derived(page.error?.message ?? 'Error')
</script>

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME}</title>
  <meta name="description" content="{errorMessage} - Secure boulder topo and session tracker." />
  <meta property="og:title" content={PUBLIC_APPLICATION_NAME} />
  <meta property="og:description" content="{errorMessage} - Secure boulder topo and session tracker." />
  <meta property="og:image" content={Logo} />
  <meta property="og:url" content={page.url.toString()} />
  <meta property="og:type" content="website" />
</svelte:head>

<Error />
