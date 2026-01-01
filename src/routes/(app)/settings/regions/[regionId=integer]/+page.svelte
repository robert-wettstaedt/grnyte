<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import {
    APP_PERMISSION_ADMIN,
    checkAppPermission,
    checkRegionPermission,
    REGION_PERMISSION_ADMIN,
    REGION_PERMISSION_EDIT,
  } from '$lib/auth'
  import { pageState } from '$lib/components/Layout'
  import { appRole, appRoleLabels } from '$lib/db/schema'
  import { AppBar, Popover, Portal } from '@skeletonlabs/skeleton-svelte'
  import { formatRelative } from 'date-fns'
  import { enGB as locale } from 'date-fns/locale'

  const { data } = $props()
  let baseUrl = $derived(`/settings/regions/${data.region.id}`)

  let isAdmin = $derived(
    checkAppPermission(pageState.userPermissions, [APP_PERMISSION_ADMIN]) ||
      checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], data.region.id),
  )

  const membersDifference = $derived(data.region.maxMembers - data.regionMembers.length)
</script>

<svelte:head>
  <title>{data.region.name} settings - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {data.region.name} settings
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  <div class="flex overflow-auto">
    <table class="table-hover table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Created at</th>

          {#if isAdmin}
            <th>Actions</th>
          {/if}
        </tr>
      </thead>

      <tbody>
        <tr class="hover:preset-tonal-primary">
          <td>{data.region.id}</td>
          <td>{data.region.name}</td>
          <td>
            {formatRelative(new Date(data.region.createdAt), new Date(), { locale })}
          </td>

          {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], data.region.id)}
            <td>
              <a href="{baseUrl}/edit" class="btn btn-sm preset-filled-primary-500"> Edit </a>
            </td>
          {/if}
        </tr>
      </tbody>
    </table>
  </div>

  {#if isAdmin}
    <div class="card preset-outlined-surface-950-50 my-8 w-full p-4">
      <p class="font-bold">Hey, heads up!</p>
      <p class="text-xs opacity-60">
        Changing the role of a user will send them a notification about their updated permissions.
      </p>
    </div>
  {/if}

  <header class="mt-8 flex items-center justify-between gap-4">
    <h2 class="text-lg font-bold">
      Members <span
        class="text-sm opacity-50 {membersDifference === 1
          ? 'text-warning-500'
          : membersDifference < 1
            ? 'text-error-500'
            : ''}">({data.regionMembers.length}/{data.region.maxMembers})</span
      >
    </h2>

    {#if isAdmin}
      <a class="btn btn-sm preset-filled-primary-500" href="{baseUrl}/invite">
        <i class="fa-solid fa-plus"></i> Invite member
      </a>
    {/if}
  </header>

  <div class="flex overflow-auto">
    <table class="table-hover table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Invited by</th>
          <th>Role</th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody>
        {#each data.regionInvitations as regionInvitation}
          <tr class="hover:preset-tonal-primary">
            <td>{regionInvitation.email}</td>
            <td class="opacity-50">{regionInvitation.invitedBy?.username}</td>
            <td>Invitation pending</td>

            <td>
              {#if isAdmin || regionInvitation.invitedBy.authUserFk === pageState.user?.authUserFk}
                <Popover positioning={{ placement: 'top' }}>
                  <Popover.Trigger class="btn-icon preset-filled-error-500 text-white!">
                    <i class="fa-solid fa-cancel"></i>
                  </Popover.Trigger>

                  <Portal>
                    <Popover.Positioner>
                      <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4">
                        <Popover.Description>
                          <article>
                            <p>
                              Are you sure you want to remove <strong>{regionInvitation.email}</strong> from the region?
                            </p>
                          </article>

                          <footer class="flex justify-end">
                            <form method="POST" action="?/removeRegionInvitation" use:enhance>
                              <input type="hidden" name="invitationId" value={regionInvitation.id} />
                              <input type="hidden" name="regionId" value={regionInvitation.regionFk} />

                              <button class="btn btn-sm preset-filled-error-500 text-white!" type="submit">Yes</button>
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
              {/if}
            </td>
          </tr>
        {/each}

        {#each data.regionMembers as regionMember}
          <tr class="hover:preset-tonal-primary">
            <td>{regionMember.user?.username}</td>
            <td>{regionMember.invitedBy?.username}</td>
            <td>
              {#if isAdmin}
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
                  <input type="hidden" name="userId" value={regionMember.userFk} />
                  <input type="hidden" name="regionId" value={regionMember.regionFk} />

                  <button aria-label="Submit" class="hidden" type="submit"></button>

                  <select
                    class="select min-w-[150px]"
                    name="role"
                    onchange={(event) => {
                      const target = event.target as HTMLSelectElement
                      target.parentElement?.querySelector('button')?.click()
                    }}
                    value={regionMember.role ?? ''}
                  >
                    <option disabled value="">-- None --</option>

                    {#each appRole.enumValues.filter((role) => role !== 'app_admin') as role}
                      <option value={role}>{appRoleLabels[role]}</option>
                    {/each}
                  </select>
                </form>
              {:else}
                {appRoleLabels[regionMember.role]}
              {/if}
            </td>

            <td>
              {#if isAdmin}
                <Popover positioning={{ placement: 'top' }}>
                  <Popover.Trigger class="btn-icon preset-filled-error-500 text-white!">
                    <i class="fa-solid fa-cancel"></i>
                  </Popover.Trigger>

                  <Portal>
                    <Popover.Positioner>
                      <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4">
                        <Popover.Description>
                          <article>
                            <p>
                              Are you sure you want to remove <strong>{regionMember.user.username}</strong> from the region?
                            </p>
                          </article>

                          <footer class="flex justify-end">
                            <form method="POST" action="?/updateRegionMember" use:enhance>
                              <input type="hidden" name="userId" value={regionMember.userFk} />
                              <input type="hidden" name="regionId" value={regionMember.regionFk} />

                              <button class="btn btn-sm preset-filled-error-500 text-white!" type="submit">Yes</button>
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
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
