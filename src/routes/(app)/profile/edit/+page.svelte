<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { pageState } from '$lib/components/Layout/page.svelte.js'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  const { data, form } = $props()

  const { t } = getI18n()
</script>

<svelte:head>
  <title>{t('profile.editProfile')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('profile.editProfile')}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>{form.success}</p>
  </aside>
{/if}

{#if page.url.searchParams.get('message') != null}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>{page.url.searchParams.get('message')}</p>
  </aside>
{/if}

{#if page.url.searchParams.get('error_description') != null}
  <aside class="card preset-tonal-error my-8 p-2 whitespace-pre-line md:p-4">
    <p>{page.url.searchParams.get('error_description')}</p>
  </aside>
{/if}

{#if page.data.session?.user.email_confirmed_at == null}
  <aside class="card preset-tonal-warning my-8 p-2 whitespace-pre-line md:p-4">
    <p>{t('profile.emailNotConfirmed')}</p>
  </aside>
{/if}

<form class="card mt-4 flex flex-col gap-4" method="post" use:enhance>
  <label class="label">
    <span>{t('common.email')}</span>

    <input
      name="email"
      type="email"
      placeholder={t('common.enterEmail')}
      class="input"
      required
      value={data.session?.user.email}
    />
  </label>

  <label class="label">
    <span>{t('common.username')}</span>
    <input
      name="username"
      type="text"
      class="input"
      placeholder={t('common.enterUsername')}
      required
      value={pageState.user?.username}
    />
  </label>

  <div class="mt-4 flex justify-between">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button"
      >{t('common.cancel')}</button
    >
    <button class="btn preset-filled-primary-500" type="submit">{t('profile.saveProfile')}</button>
  </div>
</form>
