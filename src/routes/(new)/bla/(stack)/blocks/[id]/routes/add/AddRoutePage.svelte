<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormAppBar from '$lib/components/FormActionBar/FormAppBar.svelte'
  import { getBlockContext } from '$lib/contexts/block'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getBlockName } from '$lib/helper.svelte'
  import { getI18n } from '$lib/i18n'
  import RouteFormFields from '../../../../RouteFormFields'
  import { createRoute } from './page.remote'

  const { block } = getBlockContext()
  const { t } = getI18n()
  let form = $state<HTMLFormElement>()

  $effect(() => {
    createRoute.fields.set({
      blockId: String(block.id),
      redirect: page.url.searchParams.get('redirect') ?? '',
    })
  })
</script>

<svelte:head>
  <title>{t('routes.createRouteInTitle', { name: getBlockName(block) })} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<FormAppBar
  {form}
  title={t('routes.createRoute')}
  subtitle="{t('common.in')} {getBlockName(block)}"
  pending={createRoute.pending}
/>

<div class="m-auto flex flex-col items-center py-16 md:max-w-xl">
  <form bind:this={form} class="w-full" {...createRoute.enhance(enhanceForm())}>
    <input type="hidden" {...createRoute.fields.redirect.as('text')} />

    <RouteFormFields fields={createRoute.fields} />
  </form>
</div>
