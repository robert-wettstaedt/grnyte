<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import Error from '$lib/components/Error'
  import { getI18n } from '$lib/i18n'

  const { t } = getI18n()
  const errorMessage = $derived(page.error?.message ?? t('errors.error'))
</script>

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME}</title>
  <meta name="description" content="{errorMessage} - {t('footer.tagline')}" />
  <meta property="og:title" content={PUBLIC_APPLICATION_NAME} />
  <meta property="og:description" content="{errorMessage} - {t('footer.tagline')}" />
  <meta property="og:image" content={Logo} />
  <meta property="og:url" content={page.url.toString()} />
  <meta property="og:type" content="website" />
</svelte:head>

<Error />
