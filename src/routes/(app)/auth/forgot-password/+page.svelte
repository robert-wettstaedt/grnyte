<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { getI18n } from '$lib/i18n'

  let { form } = $props()

  const { t } = getI18n()
</script>

<svelte:head>
  <title>{t('auth.forgotPassword.title')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card preset-filled-surface-100-900 w-full max-w-lg p-8">
    {#if form?.success}
      <header class="mb-8 text-center">
        <h1 class="h1 mb-2">{t('auth.forgotPassword.success')}</h1>
        <p class="opacity-75">
          {t('auth.forgotPassword.successMessage', { email: form?.email })}
        </p>
      </header>
    {:else}
      <header class="mb-8 text-center">
        <h2 class="h2 mb-2">{t('auth.forgotPassword.title')}</h2>
      </header>

      <form method="POST" class="flex flex-col gap-4" use:enhance>
        <label class="label">
          <span>{t('auth.forgotPassword.enterEmail')}</span>
          <input
            class="input"
            name="email"
            placeholder={t('common.enterEmail')}
            required
            type="email"
            value={form?.email}
          />
        </label>

        <button type="submit" class="btn preset-filled-primary-500 w-full">
          <i class="fa-solid fa-envelope"></i>
          {t('auth.forgotPassword.sendResetLink')}
        </button>
      </form>
    {/if}
  </div>
</div>
