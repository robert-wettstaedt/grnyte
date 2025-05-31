<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { AppBar, Popover } from '@skeletonlabs/skeleton-svelte'

  let basePath = $derived('/settings/tags')
</script>

<svelte:head>
  <title>Tags settings - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Tags settings
  {/snippet}

  {#snippet headline()}
    <header class="flex items-center justify-end gap-4">
      <a class="btn btn-sm preset-filled-primary-500" href="{basePath}/add">
        <i class="fa-solid fa-plus"></i> Add tag
      </a>
    </header>

    {#if page.data.tags.length === 0}
      No tags yet
    {:else}
      <div class="flex overflow-auto">
        <table class="table-hover table">
          <thead>
            <tr>
              <th class="w-full">Name</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {#each page.data.tags as tag}
              <tr class="hover:preset-tonal-primary">
                <td>{tag.id}</td>

                <td>
                  <div class="flex items-center gap-2">
                    <a href="{basePath}/{tag.id}/edit" class="btn btn-sm preset-filled-primary-500">Edit</a>

                    <Popover
                      arrow
                      arrowBackground="!bg-surface-200 dark:!bg-surface-800"
                      contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
                      positioning={{ placement: 'top' }}
                      triggerBase="btn btn-sm preset-filled-error-500 !text-white"
                    >
                      {#snippet trigger()}
                        <i class="fa-solid fa-trash"></i>Delete
                      {/snippet}

                      {#snippet content()}
                        <article>
                          <p>Are you sure you want to delete this tag?</p>
                        </article>

                        <footer class="flex justify-end">
                          <form action="?/deleteTag" method="POST" use:enhance>
                            <input type="hidden" name="id" value={tag.id} />

                            <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
                          </form>
                        </footer>
                      {/snippet}
                    </Popover>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/snippet}
</AppBar>
