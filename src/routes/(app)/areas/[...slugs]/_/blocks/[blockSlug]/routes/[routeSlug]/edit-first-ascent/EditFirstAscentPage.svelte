<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import FormFieldError from '$lib/components/FormFieldError'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import MultiSelect from '$lib/components/MultiSelect'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { getRouteContext } from '$lib/contexts/route'
  import type { RowWithRelations } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import type { PageProps } from './$types'
  import { deleteFirstAscent, updateFirstAscent } from './page.remote'

  interface Props {
    firstAscensionists: ZeroQueryResult<PageProps['data']['faQuery']>
  }

  type FA = RowWithRelations<'routesToFirstAscensionists', { firstAscensionist: true }>

  $effect(() => {
    updateFirstAscent.fields.set({
      climberName: route.firstAscents.map((fa) => (fa as FA).firstAscensionist?.name).filter((name) => name != null),
      routeId: String(route.id),
      year: route.firstAscentYear ?? undefined,
    })
  })

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

  $inspect(updateFirstAscent.fields.allIssues())
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
  <input type="hidden" {...updateFirstAscent.fields.routeId.as('text')} />

  <label class="label">
    <span>{t('firstAscent.year')}</span>
    <input
      aria-errormessage={updateFirstAscent.fields.year.issues() == null ? undefined : 'first-ascent-form-year-error'}
      class="input"
      max={new Date().getFullYear()}
      min={1950}
      placeholder={t('firstAscent.enterYear')}
      {...updateFirstAscent.fields.year.as('number')}
    />

    <FormFieldError id="first-ascent-form-year-error" issues={updateFirstAscent.fields.year.issues()} />
  </label>

  <MultiSelect
    aria-errormessage={updateFirstAscent.fields.climberName.issues() == null
      ? undefined
      : 'first-ascent-form-climberName-error'}
    label={t('firstAscent.climber')}
    options={firstAscensionists.map((firstAscensionist) => firstAscensionist.name)}
    {...updateFirstAscent.fields.climberName.as('select multiple')}
  />

  <FormFieldError id="first-ascent-form-climberName-error" issues={updateFirstAscent.fields.climberName.issues()} />

  <FormActionBar label={t('firstAscent.updateFA')} pending={updateFirstAscent.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], route.regionFk)}
  <DangerZone name={t('firstAscent.title')} onDelete={() => route.id != null && deleteFirstAscent(route.id)} />
{/if}
