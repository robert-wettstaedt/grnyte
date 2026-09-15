<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ProfileView from '$lib/components/Profile/ProfileView.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
</script>

<svelte:head>
  <title>{m.profile_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if global.user != null}
  <ProfileView userId={global.user.id} username={global.user.username} isSelf />
{/if}
