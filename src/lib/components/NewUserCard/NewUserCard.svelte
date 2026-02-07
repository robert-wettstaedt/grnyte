<script lang="ts">
  import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { createRegion } from './data.remote'
  import { getI18n } from '$lib/i18n'

  const { t } = getI18n()
</script>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-md p-6">
  <h2 class="h3 mb-4 text-center">{t('newUser.thankYouTitle', { appName: PUBLIC_APPLICATION_NAME })}</h2>

  <p class="mb-4 text-center opacity-75">{t('newUser.notMember')}</p>

  <p class="mb-4 text-center opacity-75">{t('newUser.orCreate')}</p>

  <form {...createRegion.enhance(enhanceForm())} class="flex items-end">
    <label class="label">
      <span>{t('common.name')}</span>
      <input
        class="input h-8.5 rounded-tr-none rounded-br-none"
        disabled={createRegion.pending > 0}
        name="name"
        placeholder={t('common.enterName')}
        type="text"
      />
    </label>

    <button
      aria-label={t('settings.regionSettings.createRegion')}
      title={t('settings.regionSettings.createRegion')}
      class="btn-icon preset-filled-primary-500 h-4.5 rounded-tl-none rounded-bl-none"
      disabled={createRegion.pending > 0}
      type="submit"
    >
      {#if createRegion.pending > 0 || 1}
        <LoadingIndicator />
      {:else}
        <i class="fa-solid fa-chevron-right"></i>
      {/if}
    </button>
  </form>

  {#if PUBLIC_TOPO_EMAIL}
    <p class="mt-6 text-center opacity-75">
      {t('newUser.contactIntro')}
      <a class="anchor" href="mailto:{PUBLIC_TOPO_EMAIL}">{PUBLIC_TOPO_EMAIL}</a>.
    </p>
  {/if}
</div>
