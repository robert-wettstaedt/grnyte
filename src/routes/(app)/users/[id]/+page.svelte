<!-- Public user profile (/users/[id]): the same ProfileView the /profile tab renders.
     Favorites are shown but read-only (edit controls are self-only). Reached from media
     captions and ascent rows. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import ProfileView from '$lib/components/Profile/ProfileView.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { userById } from '$lib/entities/user/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const userId = $derived(Number(page.params.id))
  const user = userById(() => userId)

  const goBack = () => back(resolve('/explore'))
</script>

<svelte:head>
  <title>{user.data?.username ?? m.profile_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<main class="relative min-w-0 flex-1 overflow-y-auto">
  <QueryState resource={user}>
    {#snippet ready(data)}
      <ProfileView userId={data.id} username={data.username} isSelf={data.id === global.user?.id} onBack={goBack} />
    {/snippet}

    {#snippet loading()}
      <!-- Chromeless route (no nav rail/tab bar): keep a way back while the profile syncs, so a
           dead sync can't strand the user on a skeleton. The empty/error states use ErrorState,
           which carries its own Explore/Back buttons. -->
      <div class="absolute top-2 left-2 z-10">
        <button
          class="btn-icon preset-filled-surface-200-800"
          onclick={goBack}
          title={m.common_back()}
          aria-label={m.common_back()}
        >
          <Icon name="arrow-left" />
        </button>
      </div>
      <div class="space-y-4 py-8" aria-busy="true">
        <div class="placeholder animate-pulse"></div>
        <div class="placeholder animate-pulse"></div>
        <div class="placeholder animate-pulse"></div>
      </div>
    {/snippet}

    {#snippet empty()}
      <ErrorState type="notfound" title={m.profile_title()} />
    {/snippet}

    {#snippet error()}
      <ErrorState type="generic" />
    {/snippet}
  </QueryState>
</main>
