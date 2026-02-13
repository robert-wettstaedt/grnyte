<script>
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import TagFormFields from '$lib/components/TagFormFields'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()

  const { t } = getI18n()
</script>

<svelte:head>
  <title>{t('tags.editTag')} {data.tag.id} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('tags.editTag')} {data.tag.id}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" method="POST" use:enhance>
  <TagFormFields id={form?.id ?? data.tag.id} />

  <div class="mt-8 flex justify-between md:items-center">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button"
      >{t('common.cancel')}</button
    >
    <button class="btn preset-filled-primary-500" type="submit">
      <i class="fa-solid fa-floppy-disk"></i>
      {t('tags.saveTag')}
    </button>
  </div>
</form>
