<script lang="ts">
  import { page } from '$app/state'
  import PageStateLoader from '$lib/components/Layout/components/PageStateLoader'
  import { initI18n } from '$lib/i18n'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import type { LayoutProps } from './$types'
  import NavTiles from '$lib/components/NavTiles'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import Logo from '$lib/assets/logo.svg'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

  let { children }: LayoutProps = $props()

  const { t } = initI18n()
</script>

{#if page.data.session?.user == null}
  {@render children?.()}
{:else}
  <main
    class={[
      'relative',
      page.data.session?.user == null || pageState.userRegions.length === 0
        ? 'min-h-[calc(100vh-3rem)]'
        : 'min-h-[calc(100vh-61px)] md:ms-24 md:min-h-screen',
    ]}
  >
    <PageStateLoader>
      {@render children?.()}
    </PageStateLoader>
  </main>

  <Navigation class="sticky bottom-0 md:hidden" layout="bar">
    <Navigation.Menu class="grid grid-cols-5 gap-2">
      <NavTiles />
    </Navigation.Menu>
  </Navigation>

  <Navigation class="fixed top-0 hidden h-screen md:flex" layout="rail">
    <Navigation.Header>
      <Navigation.TriggerAnchor href="/">
        <img class="min-h-9 min-w-9 rounded" src={Logo} alt={PUBLIC_APPLICATION_NAME} width={36} height={36} />
      </Navigation.TriggerAnchor>
    </Navigation.Header>

    <Navigation.Content class="block">
      <Navigation.Menu>
        <NavTiles />
      </Navigation.Menu>
    </Navigation.Content>

    <Navigation.Footer class="mt-auto">
      <Navigation.TriggerAnchor
        href="/settings"
        class={page.url.pathname.startsWith('/settings') ? 'bg-primary-500' : undefined}
      >
        <i class="fa-solid fa-gear"></i>

        <Navigation.TriggerText>{t('nav.settings')}</Navigation.TriggerText>
      </Navigation.TriggerAnchor>
    </Navigation.Footer>
  </Navigation>
{/if}
