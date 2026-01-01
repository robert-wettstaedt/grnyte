<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { appRole, appRoleLabels } from '$lib/db/schema'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  const { data } = $props()
</script>

<svelte:head>
  <title>Users settings - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>Users settings</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  {#if data.users.length === 0}
    No users yet
  {:else}
    <div class="card preset-outlined-surface-950-50 my-8 w-full p-4">
      <p class="font-bold">Hey, heads up!</p>
      <p class="text-xs opacity-60">
        Changing the role of a user will send them a notification about their updated permissions.
      </p>
    </div>

    <div class="flex overflow-x-auto">
      <table class="table-hover table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Email</th>

            {#each data.regions as region}
              <th>
                <a class="hover:underline" href="/settings/regions/{region.id}">{region.name}</a>
              </th>
            {/each}
          </tr>
        </thead>

        <tbody>
          {#each data.users as user}
            <tr class="hover:preset-tonal-primary">
              <td>{user.id}</td>
              <td>{user.username}</td>
              <td>{user.email}</td>

              {#each data.regions as region}
                <td>
                  <form
                    action="?/updateRegionMember"
                    class="relative"
                    method="POST"
                    use:enhance={({ formElement }) => {
                      formElement.querySelector('.spinner')?.classList.remove('hidden')

                      return ({ result }) => {
                        formElement.querySelector('.spinner')?.classList.add('hidden')
                        return applyAction(result)
                      }
                    }}
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="regionId" value={region.id} />

                    <button aria-label="Submit" class="hidden" type="submit"></button>

                    <select
                      class="select min-w-[150px]"
                      name="role"
                      onchange={(event) => {
                        const target = event.target as HTMLSelectElement
                        target.parentElement?.querySelector('button')?.click()
                      }}
                      value={data.regionMembers.find(
                        (regionMember) => regionMember.userFk === user.id && regionMember.regionFk === region.id,
                      )?.role ?? ''}
                    >
                      <option value="">-- None --</option>

                      {#each appRole.enumValues.filter((role) => role !== 'app_admin') as role}
                        <option value={role}>{appRoleLabels[role]}</option>
                      {/each}
                    </select>
                  </form>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
