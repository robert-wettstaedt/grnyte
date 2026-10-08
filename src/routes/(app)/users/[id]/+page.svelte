<!-- Public user profile (/users/[id]): the same ProfileView the /profile tab renders.
     Favorites are shown but read-only (edit controls are self-only). Reached from media
     captions and ascent rows. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import { trackView } from '$lib/components/EntitySearch/recent.svelte'
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

  trackView('users', () => user.data?.id)

  const goBack = () => back(resolve('/explore'))
</script>

<svelte:head>
  <title>{user.data?.username ?? m.profile_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<main class="relative min-w-0 flex-1 overflow-y-auto">
  <QueryState notFound={m.profile_title()} resource={user}>
    {#snippet ready(data)}
      <ProfileView userId={data.id} username={data.username} isSelf={data.id === global.user?.id} onBack={goBack} />
    {/snippet}

    {#snippet loading()}
      <!-- Chromeless route: a way back while the profile syncs, where ProfileView puts its own so it
           does not move when the profile lands. The other states use ErrorState's own buttons. -->
      <div class="container mx-auto max-w-3xl px-4 py-8">
        <div class="relative flex flex-col items-center gap-4" aria-busy="true">
          <button
            class="btn-icon preset-filled-surface-200-800 absolute top-0 left-0"
            onclick={goBack}
            title={m.common_back()}
            aria-label={m.common_back()}
          >
            <Icon name="arrow-left" />
          </button>
          <div class="skeleton-hold flex flex-col items-center gap-4">
            <Avatar loading name="" size={80} solid />
            <div class="placeholder h-7 w-40 animate-pulse"></div>
          </div>
        </div>
      </div>
    {/snippet}

    {#snippet error()}
      <ErrorState type="generic" />
    {/snippet}
  </QueryState>
</main>
