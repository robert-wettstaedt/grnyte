<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import MultiSelect from '$lib/components/MultiSelect'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { getRouteContext } from '$lib/contexts/route'
  import type { RowWithRelations } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import type { PageProps } from './$types'
  import { deleteFirstAscent, updateFirstAscent } from './page.remote'
  import { getI18n } from '$lib/i18n'

  interface Props {
    firstAscensionists: ZeroQueryResult<PageProps['data']['faQuery']>
  }

  type FA = RowWithRelations<'routesToFirstAscensionists', { firstAscensionist: true }>

  let { firstAscensionists }: Props = $props()
  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  const { route } = getRouteContext()
  const { t } = getI18n()

  let grade = $derived(pageState.grades.find((grade) => grade.id === route.gradeFk))
  const stars = $derived(route.rating == null ? '' : `${Array(route.rating).fill('★').join('')} `)
  const gradeSuffix = $derived(grade == null ? '' : ` (${grade[pageState.gradingScale]})`)
  const routeTitle = $derived(`${stars}${route.name}${gradeSuffix}`)
</script>

<svelte:head>
  <title>
    {t('firstAscent.editFAOfTitle', { name: routeTitle })}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('firstAscent.editFAOf')}
      <a class="anchor" href={basePath}>
        <RouteName {route} />
      </a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateFirstAscent.enhance(enhanceForm())}>
  <input name="routeId" type="hidden" value={route.id} />

  <label class="label">
    <span>{t('firstAscent.year')}</span>
    <input
      class="input"
      max={new Date().getFullYear()}
      min={1970}
      name="year"
      placeholder={t('firstAscent.enterYear')}
      type="number"
      value={route.firstAscentYear}
    />
  </label>

  <div class="mt-4">{t('firstAscent.climber')}</div>
  <MultiSelect
    name="climberName"
    options={firstAscensionists.map((firstAscensionist) => firstAscensionist.name)}
    value={route.firstAscents.map((fa) => (fa as FA).firstAscensionist?.name).filter((name) => name != null)}
  />

  <FormActionBar label={t('firstAscent.updateFA')} pending={updateFirstAscent.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], route.regionFk)}
  <DangerZone name={t('firstAscent.title')} onDelete={() => route.id != null && deleteFirstAscent(route.id)} />
{/if}
