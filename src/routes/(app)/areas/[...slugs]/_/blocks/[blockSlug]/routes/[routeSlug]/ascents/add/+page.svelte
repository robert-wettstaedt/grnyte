<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AscentFormFields from '$lib/components/AscentFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { getRouteContext } from '$lib/contexts/route'
  import { enhanceForm, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { addAscent } from './page.remote'
  import { DateTime } from 'luxon'

  const { route } = getRouteContext()
  const { t } = getI18n()

  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  $effect(() => {
    addAscent.fields.set({
      dateTime: DateTime.fromMillis(Date.now()).toISODate() ?? undefined,
      routeId: String(route.id),
    })
  })

  let grade = $derived(pageState.grades.find((grade) => grade.id === route.gradeFk))
  let state = $state<EnhanceState>({})
  const stars = $derived(route.rating == null ? '' : `${Array(route.rating).fill('★').join('')} `)
  const gradeSuffix = $derived(grade == null ? '' : ` (${grade[pageState.gradingScale]})`)
  const routeTitle = $derived(`${stars}${route.name}${gradeSuffix}`)
</script>

<svelte:head>
  <title>
    {t('ascents.logAscentOfTitle', { name: routeTitle })}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('ascents.logAscentOf')}
      <a class="anchor" href={basePath}>
        <RouteName {route} />
      </a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...addAscent.enhance(enhanceForm(state))}>
  <input type="hidden" name="routeId" value={route.id} />

  <AscentFormFields fields={addAscent.fields} fileUploadProps={{ state }} />

  <FormActionBar {state} label={t('ascents.saveAscent')} pending={state.loading ? 1 : addAscent.pending} />
</form>
