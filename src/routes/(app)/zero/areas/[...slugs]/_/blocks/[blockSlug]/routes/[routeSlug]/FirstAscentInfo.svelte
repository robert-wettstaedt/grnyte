<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import type { Schema } from '$lib/db/zero'
  import type { PullRow } from '@rocicorp/zero'
  import { Popover } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    route: PullRow<'routes', Schema>
  }

  const { route }: Props = $props()
</script>

<ZeroQueryWrapper
  query={page.data.z.current.query.routesToFirstAscensionists
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
              class="flex justify-between gap-2 {page.data.user?.firstAscensionistFk == null ? 'w-full md:w-auto' : ''}"
            >
              <a class="anchor" href={`/users/${firstAscent.firstAscensionist.name}`}>
                {firstAscent.firstAscensionist.name}
              </a>

              {#if page.data.user?.firstAscensionistFk == null}
                <Popover
                  arrow
                  arrowBackground="!bg-surface-200 dark:!bg-surface-800"
                  contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
                  positioning={{ placement: 'top' }}
                  triggerBase="btn btn-sm preset-outlined-primary-500 !text-white me-auto"
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
                      <form action="?/claimFirstAscensionist" method="POST" use:enhance>
                        <input type="hidden" name="firstAscensionistFk" value={firstAscent.firstAscensionist?.id} />

                        <button class="btn btn-sm preset-filled-primary-500 !text-white" type="submit"> Yes </button>
                      </form>
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

      {#if firstAscents.length === 0 && page.data.user?.firstAscensionistFk != null}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
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
              <form action="?/claimFirstAscent" method="POST" use:enhance>
                <button class="btn btn-sm preset-filled-primary-500 !text-white" type="submit"> Yes </button>
              </form>
            </footer>
          {/snippet}
        </Popover>
      {/if}
    </span>
  {/snippet}
</ZeroQueryWrapper>
