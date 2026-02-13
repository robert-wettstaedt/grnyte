<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  let { form } = $props()

  const { t } = getI18n()
  const error = $derived(page.url.searchParams.get('error_description'))
</script>

<svelte:head>
  <title>{t('auth.resetPassword.title')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('auth.resetPassword.title')}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>{t('auth.resetPassword.successMessage')}</p>
  </aside>
{/if}

{#if error == null}
  <form class="card mt-4 flex flex-col gap-4" method="post" use:enhance>
    <label class="label">
      <span>{t('auth.resetPassword.newPassword')}</span>
      <input
        name="password"
        type="password"
        placeholder={t('auth.resetPassword.enterNewPassword')}
        class="input"
        required
      />
    </label>

    <label class="label">
      <span>{t('auth.resetPassword.newPasswordConfirmation')}</span>
      <input
        name="passwordConfirmation"
        type="password"
        placeholder={t('auth.resetPassword.confirmNewPassword')}
        class="input"
        required
      />
    </label>

    <div class="mt-4 flex justify-between">
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button"
        >{t('common.cancel')}</button
      >
      <button class="btn preset-filled-primary-500" type="submit">{t('auth.resetPassword.savePassword')}</button>
    </div>
  </form>
{:else}
  <aside class="card preset-tonal-error my-8 p-2 whitespace-pre-line md:p-4">
    <p>{error}</p>
  </aside>
{/if}
