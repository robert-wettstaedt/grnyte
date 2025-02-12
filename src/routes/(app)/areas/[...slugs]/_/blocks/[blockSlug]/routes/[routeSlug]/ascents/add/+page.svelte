<script lang="ts">
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AscentFormFields from '$lib/components/AscentFormFields'
  import FileUploadForm from '$lib/components/FileUploadForm'
  import RouteName from '$lib/components/RouteName'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { DateTime } from 'luxon'

  let { data, form } = $props()
  let basePath = $derived(
    `/areas/${$page.params.slugs}/_/blocks/${$page.params.blockSlug}/routes/${$page.params.routeSlug}`,
  )

  let grade = $derived(data.grades.find((grade) => grade.id === data.route.gradeFk))
  let loading = $state(false)
</script>

<svelte:head>
  <title>
    Log ascent of
    {data.route.rating == null ? '' : `${Array(data.route.rating).fill('★').join('')} `}
    {data.route.name}
    {grade == null ? '' : ` (${grade[data.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Log ascent of</span>
    <a class="anchor" href={basePath}>
      <RouteName route={data.route} />
    </a>
  {/snippet}
</AppBar>

<FileUploadForm bind:loading className="card mt-8 p-2 md:p-4 preset-filled-surface-100-900">
  {#snippet childrenBefore()}
    <AscentFormFields
      dateTime={form?.dateTime ?? DateTime.now().toSQLDate()}
      gradeFk={form?.gradeFk ?? null}
      notes={form?.notes ?? null}
      type={form?.type ?? null}
    />
  {/snippet}

  {#snippet childrenAfter()}
    <div class="flex justify-between mt-8">
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
      <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
        {#if loading}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}

        Save ascent
      </button>
    </div>
  {/snippet}
</FileUploadForm>
