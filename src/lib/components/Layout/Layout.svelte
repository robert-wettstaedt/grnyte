<script lang="ts" module>
  export interface Data extends Omit<App.Locals, 'safeGetSession' | 'user'> {
    user: InferResultType<'users', { userSettings: { columns: { gradingScale: true } } }> | null | undefined
  }

  export interface LayoutProps {
    children: Snippet
    data: Data
    form: any
  }
</script>

<script lang="ts">
  import { afterNavigate, invalidateAll } from '$app/navigation'
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.png'
  import Breadcrumb from '$lib/components/Breadcrumb'
  import NavTiles from '$lib/components/NavTiles'
  import type { InferResultType } from '$lib/db/types'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { ProgressBar } from '@prgm/sveltekit-progress-bar'
  import { AppBar, Navigation, Popover, Switch } from '@skeletonlabs/skeleton-svelte'
  import { onMount, type Snippet } from 'svelte'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'
  import '../../../app.postcss'

  let { data, form, children }: LayoutProps = $props()

  let webManifest = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '')

  onMount(() => {
    const value = data.supabase.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.expires_at !== data.session?.expires_at) {
        invalidateAll()
      }
    })

    return () => value.data.subscription.unsubscribe()
  })

  afterNavigate(() => {
    if ($page.url.hash.length === 0) {
      document.scrollingElement?.scrollTo(0, 0)
    }
  })

  $effect(() => {
    if (form != null) {
      document.scrollingElement?.scrollTo(0, 0)
    }
  })
</script>

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME}</title>
  <meta name="description" content="Secure boulder topo and session tracker." />
  <meta property="og:title" content={PUBLIC_APPLICATION_NAME} />
  <meta property="og:description" content="Secure boulder topo and session tracker." />
  <meta property="og:image" content={Logo} />
  <meta property="og:url" content={$page.url.toString()} />
  <meta property="og:type" content="website" />

  {#if pwaAssetsHead.themeColor}
    <meta name="theme-color" content={pwaAssetsHead.themeColor.content} />
  {/if}

  {#each pwaAssetsHead.links as link}
    <link {...link} />
  {/each}

  {@html webManifest}
</svelte:head>

<div>
  <ProgressBar class="text-secondary-500 !z-[100]" />

  <AppBar classes="sticky top-0 z-50 shadow-xl">
    {#snippet lead()}
      <a class="flex gap-2" href="/">
        <img src={Logo} alt={PUBLIC_APPLICATION_NAME} width={32} height={32} />

        <strong class="text-xl">{PUBLIC_APPLICATION_NAME}</strong>
      </a>
    {/snippet}

    {#snippet trail()}
      {#if $page.data.session?.user == null}
        <a href="/auth" class="btn btn-sm preset-filled-primary-500"> Get Started </a>
      {:else}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 w-74 shadow-xl"
          positioning={{ placement: 'bottom' }}
          positionerZIndex="!z-50"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-circle-user text-3xl"></i>
          {/snippet}

          {#snippet content()}
            <div class="mb-4">
              Hi, {data.user?.username}
            </div>

            <nav class="list-nav">
              <div class="flex items-center p-2">
                Grading scale:

                <span class="mx-2">FB</span>

                <Switch
                  checked={data.user?.userSettings?.gradingScale === 'V'}
                  name="gradingScale"
                  onCheckedChange={async (event) => {
                    const response = await fetch(`/api/users/settings?gradingScale=${event.checked ? 'V' : 'FB'}`, {
                      method: 'POST',
                    })

                    if (response.ok) {
                      invalidateAll()
                    }
                  }}
                />

                <span class="mx-2">V</span>
              </div>

              <ul>
                <li>
                  <a class="flex hover:preset-filled-primary-100-900 p-2" href={`/users/${data.user?.username}`}>
                    Profile
                  </a>
                </li>

                <li>
                  <button
                    class="flex p-2 w-full hover:preset-filled-primary-100-900"
                    onclick={() => data.supabase.auth.signOut()}
                  >
                    Sign out
                  </button>
                </li>
              </ul>
            </nav>

            <div class="arrow bg-surface-100-800-token"></div>
          {/snippet}
        </Popover>
      {/if}
    {/snippet}
  </AppBar>

  <main
    class="relative p-2 md:p-4 {$page.data.session?.user == null
      ? 'min-h-[calc(100vh-4.25rem)]'
      : 'min-h-[calc(100vh-4.25rem-4.515625rem)] md:min-h-[calc(100vh-4.25rem)] md:ms-[6rem]'}"
  >
    <Breadcrumb url={$page.url} />

    {#if form?.error}
      <aside class="card preset-tonal-warning my-8 p-2 md:p-4 whitespace-pre-line">
        <p>{form.error}</p>
      </aside>
    {/if}

    {@render children?.()}
  </main>

  {#if data.userPermissions?.includes('data.read')}
    <Navigation.Bar classes="md:hidden sticky bottom-0 z-50">
      <NavTiles userPermissions={data.userPermissions} />
    </Navigation.Bar>

    <Navigation.Rail base="hidden md:block fixed top-[68px] h-screen">
      {#snippet header()}
        <Navigation.Tile href="/" label="Home">
          <i class="fa-solid fa-house"></i>
        </Navigation.Tile>
      {/snippet}

      {#snippet tiles()}
        <NavTiles userPermissions={data.userPermissions} />
      {/snippet}
    </Navigation.Rail>
  {/if}
</div>

{#await import('$lib/components/ReloadPrompt') then { default: ReloadPrompt }}
  <ReloadPrompt />
{/await}
