<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import AscentFormFields from '$lib/components/AscentFormFields'
  import DangerZone from '$lib/components/DangerZone'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import type { PageProps } from './$types'
  import { deleteAscent, updateAscent } from './page.remote'

  interface Props {
    ascent: ZeroQueryResult<PageProps['data']['query']>
  }

  let { ascent }: Props = $props()
  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(pageState.grades.find((grade) => grade.id === ascent.route?.gradeFk))
  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>
    Edit ascent of
    {ascent.route?.rating == null ? '' : `${Array(ascent.route?.rating).fill('★').join('')} `}
    {ascent.route?.name}
    {grade == null ? '' : ` (${grade[pageState.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Edit ascent

      {#if ascent.route != null}
        of
        <a class="anchor" href={basePath}>
          <RouteName route={ascent.route} />
        </a>
      {/if}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...updateAscent.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <input type="hidden" name="ascentId" value={ascent.id} />

  <AscentFormFields
    dateTime={ascent.dateTime}
    fileUploadProps={{ state }}
    gradeFk={ascent.gradeFk}
    humidity={ascent.humidity}
    notes={ascent.notes}
    rating={ascent.rating ?? null}
    temperature={ascent.temperature}
    type={ascent.type}
  />

  <FormActionBar label="Save ascent" pending={updateAscent.pending} />
</form>

{#if page.data.session?.user?.id === ascent.author?.authUserFk || checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], ascent.route?.regionFk)}
  <DangerZone name="ascent" onDelete={() => ascent.id != null && deleteAscent(ascent.id)} />
{/if}
