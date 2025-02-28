<script>
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { DELETE_PERMISSION } from '$lib/auth'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import { AppBar, Popover, ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let loading = $state(false)
</script>

<svelte:head>
  <title>Edit {data.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit block</span>
    <a class="anchor" href={basePath}>{data.name}</a>
  {/snippet}
</AppBar>

<form
  class="card mt-8 p-2 md:p-4 preset-filled-surface-100-900"
  action="?/updateBlock"
  method="POST"
  use:enhance={() => {
    loading = true

    return ({ update }) => {
      loading = false

      return update()
    }
  }}
>
  <BlockFormFields name={form?.name ?? data.name} />

  <div class="flex justify-between mt-8">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>

    <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
      {#if data.userPermissions?.includes(DELETE_PERMISSION)}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
          positioning={{ placement: 'top' }}
          triggerBase="btn preset-filled-error-500 !text-white"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-trash"></i>Delete block
          {/snippet}

          {#snippet content()}
            <article>
              <p>Are you sure you want to delete this block?</p>
            </article>

            <footer class="flex justify-end">
              <form method="POST" action="?/removeBlock" use:enhance>
                <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
              </form>
            </footer>
          {/snippet}
        </Popover>
      {/if}

      <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
        {#if loading}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}

        Update block
      </button>
    </div>
  </div>
</form>
