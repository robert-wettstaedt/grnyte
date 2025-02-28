<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AscentFormFields from '$lib/components/AscentFormFields'
  import { enhanceWithFile } from '$lib/components/FileUpload/action'
  import RouteName from '$lib/components/RouteName'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { DateTime } from 'luxon'

  let { data, form } = $props()
  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(data.grades.find((grade) => grade.id === data.route.gradeFk))
  let loading = $state(false)
  let uploadProgress = $state<number | null>(null)
  let uploadError = $state<string | null>(null)
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

<form
  class="card mt-8 p-2 md:p-4 preset-filled-surface-100-900"
  enctype="multipart/form-data"
  method="POST"
  use:enhanceWithFile={{
    session: data.session,
    supabase: data.supabase,
    user: data.authUser,
    onSubmit: async () => {
      loading = true

      return async ({ update }) => {
        const returnValue = await update()
        loading = false
        return returnValue
      }
    },
    onError: (error) => {
      uploadError = error
      loading = false
    },
    onProgress: (percentage) => (uploadProgress = percentage),
  }}
>
  <AscentFormFields
    fileUploadProps={{
      error: uploadError,
      folderName: form?.folderName,
      loading,
      progress: uploadProgress,
    }}
    dateTime={form?.dateTime ?? DateTime.now().toSQLDate()}
    gradeFk={form?.gradeFk ?? null}
    notes={form?.notes ?? null}
    rating={form?.rating ?? null}
    type={form?.type ?? null}
  />

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
</form>
