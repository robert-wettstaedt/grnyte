<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  let { form } = $props()

  const { t } = $derived(getI18n())
</script>

<svelte:head>
  <title>{t('profile.changePassword')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('profile.changePassword')}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>{t('auth.resetPassword.successMessage')}</p>
  </aside>
{/if}

<form class="card mt-4 flex flex-col gap-4" method="post" use:enhance>
  <label class="label">
    <span>{t('profile.currentPassword')}</span>
    <input name="currentPassword" type="password" placeholder={t('profile.enterCurrentPassword')} class="input" required />
  </label>

  <label class="label">
    <span>{t('auth.resetPassword.newPassword')}</span>
    <input name="password" type="password" placeholder={t('auth.resetPassword.enterNewPassword')} class="input" required />
  </label>

  <label class="label">
    <span>{t('auth.resetPassword.newPasswordConfirmation')}</span>
    <input name="passwordConfirmation" type="password" placeholder={t('auth.resetPassword.confirmNewPassword')} class="input" required />
  </label>

  <div class="mt-4 flex justify-between">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">{t('common.cancel')}</button>
    <button class="btn preset-filled-primary-500" type="submit">{t('auth.resetPassword.savePassword')}</button>
  </div>
</form>
