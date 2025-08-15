<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import MultiSelect from '$lib/components/MultiSelect'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { RowWithRelations } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { deleteFirstAscent, updateFirstAscent } from './page.remote'

  interface Props {
    firstAscensionists: RowWithRelations<'firstAscensionists', { user: true }>[]
    route: RowWithRelations<'routes', { firstAscents: true }>
  }

  type FA = RowWithRelations<'routesToFirstAscensionists', { firstAscensionist: true }>

  let { firstAscensionists, route }: Props = $props()
  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(pageState.grades.find((grade) => grade.id === route.gradeFk))
</script>

<svelte:head>
  <title>
    Edit FA of
    {route.rating == null ? '' : `${Array(route.rating).fill('★').join('')} `}
    {route.name}
    {grade == null ? '' : ` (${grade[pageState.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit FA of</span>
    <a class="anchor" href={basePath}>
      <RouteName {route} />
    </a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateFirstAscent.enhance(enhanceForm())}>
  <input name="routeId" type="hidden" value={route.id} />

  <label class="label">
    <span>Year</span>
    <input
      class="input"
      max={new Date().getFullYear()}
      min={1970}
      name="year"
      placeholder="Enter year..."
      type="number"
      value={route.firstAscentYear}
    />
  </label>

  <div class="mt-4">Climber</div>
  <MultiSelect
    name="climberName"
    options={firstAscensionists.map((firstAscensionist) => firstAscensionist.name)}
    value={route.firstAscents.map((fa) => (fa as FA).firstAscensionist?.name).filter((name) => name != null)}
  />

  <FormActionBar label="Update FA" pending={updateFirstAscent.pending} />
</form>

<DangerZone name="FA" onDelete={() => route.id != null && deleteFirstAscent(route.id)} />
