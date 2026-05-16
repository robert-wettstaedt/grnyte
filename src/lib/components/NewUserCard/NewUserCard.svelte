<script lang="ts">
  import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
  import FormFieldError from '$lib/components/FormFieldError'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { createRegion } from './data.remote'

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
        aria-errormessage={createRegion.fields.name.issues() ? 'new-user-card-name-error' : undefined}
        class="input h-8.5 rounded-tr-none rounded-br-none"
        disabled={createRegion.pending > 0}
        placeholder={t('common.enterName')}
        {...createRegion.fields.name.as('text')}
      />
    </label>

    <button
      aria-label={t('settings.regionSettings.createRegion')}
      title={t('settings.regionSettings.createRegion')}
      class="btn-icon preset-filled-primary-500 h-4.5 rounded-tl-none rounded-bl-none"
      disabled={createRegion.pending > 0 || !createRegion.fields.name.value()}
      type="submit"
    >
      {#if createRegion.pending > 0}
        <LoadingIndicator />
      {:else}
        <i class="fa-solid fa-chevron-right"></i>
      {/if}
    </button>
  </form>

  <FormFieldError id="new-user-card-name-error" issues={createRegion.fields.name.issues()} />

  {#if PUBLIC_TOPO_EMAIL}
    <p class="mt-6 text-center opacity-75">
      {t('newUser.contactIntro')}
      <a class="anchor" href="mailto:{PUBLIC_TOPO_EMAIL}">{PUBLIC_TOPO_EMAIL}</a>.
    </p>
  {/if}
</div>
