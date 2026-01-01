<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { pageState } from '$lib/components/Layout'
  import { AppBar, Popover, Portal } from '@skeletonlabs/skeleton-svelte'

  let basePath = $derived('/settings/tags')
</script>

<svelte:head>
  <title>Tags settings - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>Tags settings</AppBar.Headline>

    <AppBar.Trail>
      <a class="btn btn-sm preset-filled-primary-500" href="{basePath}/add">
        <i class="fa-solid fa-plus"></i> Add tag
      </a>
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  {#if pageState.tags.length === 0}
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
          {#each pageState.tags as tag}
            <tr class="hover:preset-tonal-primary">
              <td>{tag.id}</td>

              <td>
                <div class="flex items-center gap-2">
                  <a href="{basePath}/{tag.id}/edit" class="btn btn-sm preset-filled-primary-500">Edit</a>

                  <Popover positioning={{ placement: 'top' }}>
                    <Popover.Trigger class="btn btn-sm preset-filled-error-500 text-white!">
                      <i class="fa-solid fa-trash"></i>Delete
                    </Popover.Trigger>

                    <Portal>
                      <Popover.Positioner>
                        <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4">
                          <Popover.Description>
                            <article>
                              <p>Are you sure you want to delete this tag?</p>
                            </article>

                            <footer class="flex justify-end">
                              <form action="?/deleteTag" method="POST" use:enhance>
                                <input type="hidden" name="id" value={tag.id} />

                                <button class="btn btn-sm preset-filled-error-500 text-white!" type="submit">Yes</button
                                >
                              </form>
                            </footer>
                          </Popover.Description>

                          <Popover.Arrow
                            class="[--arrow-background:var(--color-surface-200-800)] [--arrow-size:--spacing(2)]"
                          >
                            <Popover.ArrowTip />
                          </Popover.Arrow>
                        </Popover.Content>
                      </Popover.Positioner>
                    </Portal>
                  </Popover>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
