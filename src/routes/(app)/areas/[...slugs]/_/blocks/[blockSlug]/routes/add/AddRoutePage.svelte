<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormActionBar from '$lib/components/FormActionBar'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import RouteFormFields from '$lib/components/RouteFormFields'
  import { getBlockContext } from '$lib/contexts/block'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createRoute } from './page.remote'

  const { block } = getBlockContext()
  const { t } = getI18n()

  $effect(() => {
    createRoute.fields.set({
      blockId: String(block.id),
      redirect: page.url.searchParams.get('redirect') ?? '',
    })
  })

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)
</script>

<svelte:head>
  <title>{t('routes.createRouteInTitle', { name: block.name })} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('routes.createRoute')} <a class="anchor" href={basePath}>{block.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createRoute.enhance(enhanceForm())}>
  <RouteFormFields fields={createRoute.fields} />

  <input type="hidden" {...createRoute.fields.redirect.as('text')} />

  <FormActionBar label={t('routes.saveRoute')} pending={createRoute.pending}>
    {#snippet buttons()}
      <button
        class="btn preset-outlined-primary-500"
        disabled={createRoute.pending > 0}
        {...createRoute.fields.reload.as('submit', 'true')}
      >
        {#if createRoute.pending > 0}
          <LoadingIndicator />
        {/if}

        {t('routes.saveAndCreateAnother')}
      </button>
    {/snippet}
  </FormActionBar>
</form>
