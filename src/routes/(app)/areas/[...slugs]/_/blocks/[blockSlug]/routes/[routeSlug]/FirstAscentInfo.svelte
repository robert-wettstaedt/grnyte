<script lang="ts">
  import { pageState } from '$lib/components/Layout'
  import { getRouteContext } from '$lib/contexts/route'
  import { Popover, Portal } from '@skeletonlabs/skeleton-svelte'
  import { claimFirstAscensionist, claimFirstAscent } from './page.remote'
  import { getI18n } from '$lib/i18n'

  const { route } = getRouteContext()
  const { t } = getI18n()

  const { firstAscentYear, firstAscents } = route
</script>

<span class="flex flex-wrap items-center gap-2">
  {#if firstAscents.length === 0 && firstAscentYear == null}
    <span>{t('common.unknown')}</span>
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
            <Popover positioning={{ placement: 'top' }}>
              <Popover.Trigger class="btn btn-sm preset-outlined-primary-500 me-auto text-white!">
                {t('firstAscent.thatsMe')}
              </Popover.Trigger>

              <Portal>
                <Popover.Positioner>
                  <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4">
                    <Popover.Description>
                      <article>
                        <p>
                          {t('firstAscent.claimAttributionDescription', { name: firstAscent.firstAscensionist?.name })}
                        </p>
                      </article>

                      <footer class="flex justify-end">
                        <button
                          class="btn btn-sm preset-filled-primary-500 text-white!"
                          onclick={() =>
                            claimFirstAscensionist({
                              firstAscensionistFk: firstAscent.firstAscensionist?.id,
                              routeId: route.id,
                            })}
                        >
                          {t('common.yes')}
                        </button>
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

  {#if firstAscentYear != null}
    <span>
      {firstAscentYear}
    </span>
  {/if}

  {#if firstAscents.length === 0 && pageState.user?.firstAscensionistFk != null}
    <Popover positioning={{ placement: 'top' }}>
      <Popover.Trigger class="btn btn-sm preset-outlined-primary-500 me-auto text-white!"
        >{t('firstAscent.claimFA')}</Popover.Trigger
      >

      <Portal>
        <Popover.Positioner>
          <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4">
            <Popover.Description>
              <article>
                <p>{t('firstAscent.claimConfirmation')}</p>
              </article>

              <footer class="flex justify-end">
                <button
                  class="btn btn-sm preset-filled-primary-500 text-white!"
                  onclick={() => route.id != null && claimFirstAscent(route.id)}
                >
                  {t('common.yes')}
                </button>
              </footer>
            </Popover.Description>

            <Popover.Arrow class="[--arrow-background:var(--color-surface-200-800)] [--arrow-size:--spacing(2)]">
              <Popover.ArrowTip />
            </Popover.Arrow>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover>
  {/if}
</span>
