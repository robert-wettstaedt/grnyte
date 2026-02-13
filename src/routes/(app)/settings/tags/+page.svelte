<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { pageState } from '$lib/components/Layout'
  import { getI18n } from '$lib/i18n'
  import { AppBar, Popover, Portal } from '@skeletonlabs/skeleton-svelte'

  let basePath = $derived('/settings/tags')

  const { t } = getI18n()
</script>

<svelte:head>
  <title>{t('tags.tagsSettings')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('tags.tagsSettings')}</AppBar.Headline>

    <AppBar.Trail>
      <a class="btn btn-sm preset-filled-primary-500" href="{basePath}/add">
        <i class="fa-solid fa-plus"></i>
        {t('tags.addTag')}
      </a>
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  {#if pageState.tags.length === 0}
    {t('tags.noTagsYet')}
  {:else}
    <div class="flex overflow-auto">
      <table class="table-hover table">
        <thead>
          <tr>
            <th class="w-full">{t('common.name')}</th>
            <th>{t('tags.actions')}</th>
          </tr>
        </thead>

        <tbody>
          {#each pageState.tags as tag}
            <tr class="hover:preset-tonal-primary">
              <td>{tag.id}</td>

              <td>
                <div class="flex items-center gap-2">
                  <a href="{basePath}/{tag.id}/edit" class="btn btn-sm preset-filled-primary-500">{t('common.edit')}</a>

                  <Popover positioning={{ placement: 'top' }}>
                    <Popover.Trigger class="btn btn-sm preset-filled-error-500 text-white!">
                      <i class="fa-solid fa-trash"></i>{t('common.delete')}
                    </Popover.Trigger>

                    <Portal>
                      <Popover.Positioner>
                        <Popover.Content class="card bg-surface-200-800 max-w-[320px] space-y-4 p-4">
                          <Popover.Description>
                            <article>
                              <p>{t('tags.confirmDeleteTag')}</p>
                            </article>

                            <footer class="flex justify-end">
                              <form action="?/deleteTag" method="POST" use:enhance>
                                <input type="hidden" name="id" value={tag.id} />

                                <button class="btn btn-sm preset-filled-error-500 text-white!" type="submit"
                                  >{t('common.yes')}</button
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
