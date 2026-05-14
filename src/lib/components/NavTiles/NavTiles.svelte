<script lang="ts">
  import { page } from '$app/state'
  import { getI18n } from '$lib/i18n'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'

  const { t } = getI18n()
</script>

<Navigation.TriggerAnchor href="/" class={page.url.pathname === '/' ? 'bg-primary-500' : undefined}>
  <i class="fa-solid fa-house"></i>

  <Navigation.TriggerText>{t('nav.home')}</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor href="/areas" class={page.url.pathname.startsWith('/areas') ? 'bg-primary-500' : undefined}>
  <i class="fa-solid fa-layer-group"></i>

  <Navigation.TriggerText>{t('nav.browse')}</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor href="/feed" class={page.url.pathname.startsWith('/feed') ? 'bg-primary-500' : undefined}>
  <i class="fa-solid fa-square-poll-horizontal"></i>

  <Navigation.TriggerText>{t('nav.feed')}</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor href="/search" class={page.url.pathname.startsWith('/search') ? 'bg-primary-500' : undefined}>
  <i class="fa-solid fa-search"></i>

  <Navigation.TriggerText>{t('nav.search')}</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor
  href="/settings"
  class={page.url.pathname.startsWith('/settings') ? 'bg-primary-500' : undefined}
>
  <i class="fa-solid fa-gear"></i>

  <Navigation.TriggerText>{t('nav.settings')}</Navigation.TriggerText>
</Navigation.TriggerAnchor>
