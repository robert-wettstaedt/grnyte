<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { DELETE_PERMISSION } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AscentFormFields from '$lib/components/AscentFormFields'
  import { enhanceWithFile } from '$lib/components/FileUpload'
  import RouteName from '$lib/components/RouteName'
  import { Popover } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(data.grades.find((grade) => grade.id === data.ascent.route.gradeFk))
  let loading = $state(false)
  let uploadProgress = $state<number | null>(null)
  let uploadError = $state<string | null>(null)
</script>

<svelte:head>
  <title>
    Edit ascent of
    {data.ascent.route.rating == null ? '' : `${Array(data.ascent.route.rating).fill('★').join('')} `}
    {data.ascent.route.name}
    {grade == null ? '' : ` (${grade[data.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit ascent of</span>
    <a class="anchor" href={basePath}>
      <RouteName route={data.ascent.route} />
    </a>
  {/snippet}
</AppBar>

<form
  action="?/updateAscent"
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  enctype="multipart/form-data"
  method="POST"
  use:enhanceWithFile={{
    session: data.session,
    supabase: data.supabase,
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
    dateTime={form?.dateTime ?? data.ascent.dateTime}
    gradeFk={form?.gradeFk ?? data.ascent.gradeFk}
    notes={form?.notes ?? data.ascent.notes}
    rating={form?.rating ?? data.ascent.rating ?? null}
    type={form?.type ?? data.ascent.type}
  />

  <div class="mt-8 flex justify-between md:items-center">
    <div>
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    </div>

    <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
      {#if page.data.session?.user?.id === data.ascent.author.authUserFk || data.userPermissions?.includes(DELETE_PERMISSION)}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
          positioning={{ placement: 'top' }}
          triggerBase="btn preset-filled-error-500 !text-white"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-trash"></i>Delete ascent
          {/snippet}

          {#snippet content()}
            <article>
              <p>Are you sure you want to delete this ascent?</p>
            </article>

            <footer class="flex justify-end">
              <form method="POST" action="?/removeAscent" use:enhance>
                <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
              </form>
            </footer>
          {/snippet}
        </Popover>
      {/if}

      <button class="btn preset-filled-primary-500" type="submit">Save ascent</button>
    </div>
  </div>
</form>
