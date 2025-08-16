<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AscentFormFields from '$lib/components/AscentFormFields'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import type { PageProps } from './$types'
  import { addAscent } from './page.remote'

  interface Props {
    route: ZeroQueryResult<PageProps['data']['query']>['routes'][0]
  }

  let { route }: Props = $props()
  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(pageState.grades.find((grade) => grade.id === route.gradeFk))
  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>
    Log ascent of
    {route.rating == null ? '' : `${Array(route.rating).fill('★').join('')} `}
    {route.name}
    {grade == null ? '' : ` (${grade[pageState.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Log ascent of</span>
    <a class="anchor" href={basePath}>
      <RouteName {route} />
    </a>
  {/snippet}
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...addAscent.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <input type="hidden" name="routeId" value={route.id} />

  <AscentFormFields
    fileUploadProps={{ state }}
    dateTime={Date.now()}
    gradeFk={null}
    notes={null}
    rating={null}
    type={null}
  />

  <FormActionBar label="Save ascent" pending={addAscent.pending} />
</form>
