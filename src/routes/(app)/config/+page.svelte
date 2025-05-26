<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { appRole, appRoleLabels } from '$lib/db/schema'
  import { AppBar, Popover, ProgressRing, Tabs } from '@skeletonlabs/skeleton-svelte'
  import { formatRelative } from 'date-fns'
  import { enGB as locale } from 'date-fns/locale'
  import { onMount } from 'svelte'

  let { data } = $props()

  let tabValue: string | undefined = $state(undefined)
  afterNavigate(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : '#tags'
  })
  onMount(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : '#tags'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.hash = event.value
    goto(newUrl.toString(), { replaceState: true })
  }
</script>

<svelte:head>
  <title>Config - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Config
  {/snippet}

  {#snippet headline()}
    <Tabs
      fluid
      listClasses="overflow-x-auto overflow-y-hidden pb-[1px] md:w-[500px]"
      listGap="0"
      onValueChange={onChangeTab}
      value={tabValue}
    >
      {#snippet list()}
        <Tabs.Control value="#tags">Tags</Tabs.Control>
        <Tabs.Control value="#regions">Regions</Tabs.Control>
        <Tabs.Control value="#users">Users</Tabs.Control>
      {/snippet}

      {#snippet content()}
        <Tabs.Panel value="#tags">
          <header class="flex items-center justify-end gap-4">
            <a class="btn btn-sm preset-filled-primary-500" href="/config/tags/add">
              <i class="fa-solid fa-plus"></i> Add tag
            </a>
          </header>

          {#if data.tags.length === 0}
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
                                <form action="?/deleteTag" method="POST" use:enhance>
                                  <input type="hidden" name="id" value={tag.id} />

                                  <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit"
                                    >Yes</button
                                  >
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
        </Tabs.Panel>

        <Tabs.Panel value="#regions">
          <header class="flex items-center justify-end gap-4">
            <a class="btn btn-sm preset-filled-primary-500" href="/config/regions/add">
              <i class="fa-solid fa-plus"></i> Add region
            </a>
          </header>

          {#if data.regions.length === 0}
            No regions yet
          {:else}
            <div class="flex overflow-auto">
              <table class="table-hover table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Created at</th>
                    <th>Actions</th>
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
                      <td>
                        <a href="/config/regions/{region.id}/edit" class="btn btn-sm preset-filled-primary-500">Edit</a>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </Tabs.Panel>

        <Tabs.Panel value="#users">
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
                      <th>{region.name}</th>
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

                            <div class="bg-surface-100-900 spinner absolute top-1/2 right-3 hidden -translate-y-1/2">
                              <ProgressRing size="size-4" value={null} />
                            </div>

                            <select
                              class="select min-w-[150px]"
                              name="role"
                              onchange={(event) => {
                                const target = event.target as HTMLSelectElement
                                target.parentElement?.querySelector('button')?.click()
                              }}
                              value={data.regionMembers.find(
                                (regionMember) =>
                                  regionMember.userFk === user.id && regionMember.regionFk === region.id,
                              )?.role ?? ''}
                            >
                              <option value="">-- None --</option>

                              {#each appRole.enumValues as role}
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
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  {/snippet}
</AppBar>
