<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import FileUpload, { enhanceWithFile } from '$lib/components/FileUpload'
  import RouteName from '$lib/components/RouteName'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let grade = $derived(data.grades.find((grade) => grade.id === data.route.gradeFk))
  let loading = $state(false)
  let uploadProgress = $state<number | null>(null)
  let uploadError = $state<string | null>(null)
</script>

<svelte:head>
  <title>
    Edit files of
    {data.route.rating == null ? '' : `${Array(data.route.rating).fill('★').join('')} `}
    {data.route.name}
    {grade == null ? '' : ` (${grade[data.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

{#if form?.error}
  <aside class="card preset-tonal-warning my-8 p-2 md:p-4 whitespace-pre-line">
    <p>{form.error}</p>
  </aside>
{/if}

<AppBar>
  {#snippet lead()}
    <span>Edit files of</span>
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
  <FileUpload error={uploadError} progress={uploadProgress} folderName={form?.folderName} {loading} />

  <div class="flex justify-between mt-8">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
      {#if loading}
        <span class="me-2">
          <ProgressRing size="size-4" value={null} />
        </span>
      {/if}

      Upload
    </button>
  </div>
</form>
