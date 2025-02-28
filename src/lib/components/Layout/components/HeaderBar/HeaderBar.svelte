<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.png'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { AppBar, Popover, Switch } from '@skeletonlabs/skeleton-svelte'
  import type { LayoutProps } from '../../'

  let { data }: Pick<LayoutProps, 'data'> = $props()
</script>

<AppBar classes="sticky top-0 z-50 shadow-xl">
  {#snippet lead()}
    <a class="flex gap-2" href="/">
      <img src={Logo} alt={PUBLIC_APPLICATION_NAME} width={32} height={32} />

      <strong class="text-xl">{PUBLIC_APPLICATION_NAME}</strong>
    </a>
  {/snippet}

  {#snippet trail()}
    {#if page.data.session?.user == null}
      <a href="/auth" class="btn btn-sm preset-filled-primary-500"> Get Started </a>
    {:else}
      <Popover
        arrow
        arrowBackground="!bg-surface-200 dark:!bg-surface-800"
        contentBase="card bg-surface-200-800 p-4 w-74 shadow-xl"
        positioning={{ placement: 'bottom' }}
        positionerZIndex="!z-50"
      >
        {#snippet trigger()}
          <i class="fa-solid fa-circle-user text-3xl"></i>
        {/snippet}

        {#snippet content()}
          <div class="mb-4">
            Hi, {data.user?.username}
          </div>

          <nav class="list-nav">
            <div class="flex items-center p-2">
              Grading scale:

              <span class="mx-2">FB</span>

              <Switch
                checked={data.user?.userSettings?.gradingScale === 'V'}
                name="gradingScale"
                onCheckedChange={async (event) => {
                  const response = await fetch(`/api/users/settings?gradingScale=${event.checked ? 'V' : 'FB'}`, {
                    method: 'POST',
                  })

                  if (response.ok) {
                    invalidateAll()
                  }
                }}
              />

              <span class="mx-2">V</span>
            </div>

            <ul>
              <li>
                <a class="flex hover:preset-filled-primary-100-900 p-2" href={`/users/${data.user?.username}`}>
                  Profile
                </a>
              </li>

              <li>
                <button
                  class="flex p-2 w-full hover:preset-filled-primary-100-900"
                  onclick={() => data.supabase.auth.signOut()}
                >
                  Sign out
                </button>
              </li>
            </ul>
          </nav>

          <div class="arrow bg-surface-100-800-token"></div>
        {/snippet}
      </Popover>
    {/if}
  {/snippet}
</AppBar>
