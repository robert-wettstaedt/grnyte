<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_DEMO_MODE } from '$env/static/public'
  import { getI18n } from '$lib/i18n'

  let { form } = $props()

  const { t } = $derived(getI18n())
</script>

<svelte:head>
  <title>{t('auth.signIn.login')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card preset-filled-surface-100-900 w-full max-w-lg p-8">
    <header class="mb-8 text-center">
      <h1 class="h1 mb-2">{t('auth.signIn.title')}</h1>
      <p class="opacity-75">{t('auth.signIn.subtitle', { appName: PUBLIC_APPLICATION_NAME })}</p>
    </header>

    <form method="POST" class="flex flex-col gap-4" use:enhance>
      <label class="label">
        <span>{t('common.email')}</span>
        <input
          class="input"
          name="email"
          placeholder={t('common.enterEmail')}
          required
          type="email"
          value={PUBLIC_DEMO_MODE ? 'demo@demo.com' : form?.email}
        />
      </label>

      <label class="label">
        <span>{t('common.password')}</span>
        <input
          class="input"
          name="password"
          placeholder={t('common.enterPassword')}
          required
          type="password"
          value={PUBLIC_DEMO_MODE ? 'demo' : undefined}
        />
      </label>

      <button type="submit" class="btn preset-filled-primary-500 w-full">
        <i class="fa-solid fa-right-to-bracket"></i>
        {t('auth.signIn.login')}
      </button>

      <a href="/auth/forgot-password" class="anchor w-full text-right"> {t('auth.signIn.forgotPassword')} </a>

      <hr class="my-4" />

      <a href="/auth/signup" class="btn preset-outlined-primary-500 w-full">
        <i class="fa-solid fa-user-plus"></i>
        {t('auth.signIn.createAccount')}
      </a>
    </form>
  </div>
</div>
