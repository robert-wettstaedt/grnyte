<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { REGION_ADMIN_PERMISSION, TAG_ADMIN_PERMISSION, USER_ADMIN_PERMISSION } from '$lib/auth'
  import { AppBar, Popover } from '@skeletonlabs/skeleton-svelte'
  import { formatRelative } from 'date-fns'
  import { enGB as locale } from 'date-fns/locale'

  let { data } = $props()
</script>

<svelte:head>
  <title>Config - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Config
  {/snippet}
</AppBar>

{#if page.data.userPermissions?.includes(TAG_ADMIN_PERMISSION)}
  <div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="user-settings">
    <header class="flex items-center justify-between gap-4">
      <h2 class="h4">Tags</h2>

      <a class="btn btn-sm preset-filled-primary-500" href="/config/tags/add">
        <i class="fa-solid fa-plus"></i> Add tag
      </a>
    </header>

    {#if data.tags.length === 0}
      No tags yet
    {:else}
      <table class="table-hover table">
        <thead>
          <tr>
            <th class="w-full">Name</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {#each data.tags as tag}
            <tr class="hover:preset-tonal-primary">
              <td>{tag.id}</td>

              <td>
                <div class="flex items-center gap-2">
                  <a href="/config/tags/{tag.id}/edit" class="btn btn-sm preset-filled-primary-500">Edit</a>

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
                        <form action="?/delete" method="POST" use:enhance>
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
    {/if}
  </div>
{/if}

{#if page.data.userPermissions?.includes(REGION_ADMIN_PERMISSION)}
  <div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="user-settings">
    <header class="flex items-center justify-between gap-4">
      <h2 class="h4">Regions</h2>
    </header>

    {#if data.regions.length === 0}
      No regions yet
    {:else}
      <table class="table-hover table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Created at</th>
          </tr>
        </thead>

        <tbody>
          {#each data.regions as region}
            <tr class="hover:preset-tonal-primary">
              <td>{region.id}</td>
              <td>{region.name}</td>
              <td>
                {formatRelative(new Date(region.createdAt), new Date(), { locale })}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
{/if}

{#if page.data.userPermissions?.includes(REGION_ADMIN_PERMISSION)}
  <div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="user-settings">
    <header class="flex items-center justify-between gap-4">
      <h2 class="h4">Users</h2>
    </header>

    {#if data.users.length === 0}
      No users yet
    {:else}
      <table class="table-hover table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Regions</th>
          </tr>
        </thead>

        <tbody>
          {#each data.users as user}
            <tr class="hover:preset-tonal-primary">
              <td>{user.id}</td>
              <td>{user.username}</td>

              <td class="flex flex-wrap gap-2">
                {#each data.regionMembers as regionMember}
                  {#if regionMember.userFk === user.id}
                    <span class="badge preset-filled-primary-500">
                      {data.regions.find((region) => region.id === regionMember.regionFk)?.name}
                    </span>
                  {/if}
                {/each}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
{/if}
