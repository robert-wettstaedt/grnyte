<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { getI18n } from '$lib/i18n'

  let { form } = $props()

  const { t } = getI18n()
</script>

<svelte:head>
  <title>{t('auth.signUp.signUp')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card preset-filled-surface-100-900 w-full max-w-lg p-8">
    {#if form?.success}
      <header class="mb-8 text-center">
        <h1 class="h1 mb-2">{t('auth.signUp.success')}</h1>
        <p class="opacity-75">
          {t('auth.signUp.successMessage', { email: form.email })}
        </p>
      </header>
    {:else}
      <header class="mb-8 text-center">
        <h1 class="h1 mb-2">{t('auth.signUp.title')}</h1>
        <p class="opacity-75">{t('auth.signUp.subtitle', { appName: PUBLIC_APPLICATION_NAME })}</p>
      </header>

      <form method="POST" class="space-y-4" use:enhance>
        <label class="label">
          <span>{t('common.email')}</span>
          <input
            name="email"
            type="email"
            placeholder={t('common.enterEmail')}
            class="input"
            required
            value={form?.email}
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
            value={form?.username}
          />
        </label>

        <label class="label">
          <span>{t('common.password')}</span>
          <input name="password" type="password" placeholder={t('common.enterPassword')} class="input" required />
        </label>

        <label class="label">
          <span>{t('auth.signUp.passwordConfirmation')}</span>
          <input
            name="passwordConfirmation"
            type="password"
            placeholder={t('common.enterPassword')}
            class="input"
            required
          />
        </label>

        <!-- Terms & Conditions acceptance -->
        <label class="label mt-6 flex items-start gap-3">
          <input name="acceptTerms" type="checkbox" class="checkbox mt-1" />
          <span class="text-sm leading-5">
            {t('auth.signUp.acceptTerms')}
            <a href="/legal/terms" target="_blank" class="anchor">{t('legal.termsOfService')}</a>
            {t('auth.signUp.and')}
            <a href="/legal/privacy" target="_blank" class="anchor">{t('legal.privacyPolicy')}</a>.
          </span>
        </label>

        <div class="mt-8 flex items-center justify-between">
          <button type="submit" class="btn preset-filled-primary-500 w-full">
            <i class="fa-solid fa-right-to-bracket"></i>
            {t('auth.signUp.signUp')}
          </button>
        </div>

        <div class="divider my-8"></div>

        <div class="flex flex-col gap-4">
          <a href="/auth/signin" class="btn preset-outlined-primary-500">
            <i class="fa-solid fa-user"></i>
            {t('auth.signUp.loginExisting')}
          </a>
        </div>
      </form>
    {/if}
  </div>
</div>
