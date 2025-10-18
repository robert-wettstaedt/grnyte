<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { getRouteContext } from '$lib/contexts/route'
  import { Popover } from '@skeletonlabs/skeleton-svelte'
  import { claimFirstAscensionist, claimFirstAscent } from './page.remote'

  const { route } = getRouteContext()
</script>

<ZeroQueryWrapper
  query={page.data.z.query.routesToFirstAscensionists
    .where('routeFk', route.id!)
    .related('firstAscensionist', (q) => q.related('user'))}
>
  {#snippet children(firstAscents)}
    <span class="flex flex-wrap items-center gap-2">
      {#if firstAscents.length === 0 && route.firstAscentYear == null}
        <span>unknown</span>
      {/if}

      {#each firstAscents as firstAscent, index}
        {#if firstAscent.firstAscensionist != null}
          {#if firstAscent.firstAscensionist.user == null}
            <span
              class="flex justify-between gap-2 {pageState.user?.firstAscensionistFk == null ? 'w-full md:w-auto' : ''}"
            >
              <a class="anchor" href={`/users/${firstAscent.firstAscensionist.name}`}>
                {firstAscent.firstAscensionist.name}
              </a>

              {#if pageState.user?.firstAscensionistFk == null}
                <Popover
                  arrow
                  arrowBackground="!bg-surface-200 dark:!bg-surface-800"
                  contentBase="card bg-surface-200-800 max-w-[320px] space-y-4 p-4"
                  positioning={{ placement: 'top' }}
                  triggerBase="btn btn-sm preset-outlined-primary-500 me-auto !text-white"
                >
                  {#snippet trigger()}
                    That's me!
                  {/snippet}

                  {#snippet content()}
                    <article>
                      <p>
                        All FAs with the name {firstAscent.firstAscensionist?.name} will be attributed to you. Are you sure
                        that this is you?
                      </p>
                    </article>

                    <footer class="flex justify-end">
                      <button
                        class="btn btn-sm preset-filled-primary-500 !text-white"
                        onclick={() =>
                          claimFirstAscensionist({
                            firstAscensionistFk: firstAscent.firstAscensionist?.id,
                            routeId: route.id,
                          })}
                      >
                        Yes
                      </button>
                    </footer>
                  {/snippet}
                </Popover>
              {/if}
            </span>

            {#if index < firstAscents.length - 1}
              <span class="hidden md:block">|</span>
            {/if}
          {:else}
            <a class="anchor" href={`/users/${firstAscent.firstAscensionist.user.username}`}>
              {firstAscent.firstAscensionist.name}
            </a>

            {#if index < firstAscents.length - 1}
              <span>|</span>
            {/if}
          {/if}
        {/if}
      {/each}

      {#if route.firstAscentYear != null}
        <span>
          {route.firstAscentYear}
        </span>
      {/if}

      {#if firstAscents.length === 0 && pageState.user?.firstAscensionistFk != null}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 max-w-[320px] space-y-4 p-4"
          positioning={{ placement: 'top' }}
          triggerBase="btn btn-sm preset-outlined-primary-500 !text-white"
        >
          {#snippet trigger()}
            Claim FA
          {/snippet}

          {#snippet content()}
            <article>
              <p>This FA will be attributed to you. Are you sure?</p>
            </article>

            <footer class="flex justify-end">
              <button
                class="btn btn-sm preset-filled-primary-500 !text-white"
                onclick={() => route.id != null && claimFirstAscent(route.id)}
              >
                Yes
              </button>
            </footer>
          {/snippet}
        </Popover>
      {/if}
    </span>
  {/snippet}
</ZeroQueryWrapper>
