<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AscentFormFields from '$lib/components/AscentFormFields'
  import DangerZone from '$lib/components/DangerZone'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import type { RowWithRelations } from '$lib/db/zero'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { deleteAscent, updateAscent } from './page.remote'

  interface Props {
    ascent: RowWithRelations<'ascents', { author: true; route: true }>
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
  {#snippet lead()}
    {#if ascent.route != null}
      <span>Edit ascent of</span>
      <a class="anchor" href={basePath}>
        <RouteName route={ascent.route} />
      </a>
    {/if}
  {/snippet}
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...updateAscent.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <input type="hidden" name="ascentId" value={ascent.id} />

  <AscentFormFields
    fileUploadProps={{ state }}
    dateTime={ascent.dateTime}
    gradeFk={ascent.gradeFk}
    notes={ascent.notes}
    rating={ascent.rating ?? null}
    type={ascent.type}
  />

  <FormActionBar label="Save ascent" pending={updateAscent.pending} />
</form>

{#if page.data.session?.user?.id === ascent.author?.authUserFk || checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], ascent.route?.regionFk)}
  <DangerZone name="ascent" onDelete={() => ascent.id != null && deleteAscent(ascent.id)} />
{/if}
