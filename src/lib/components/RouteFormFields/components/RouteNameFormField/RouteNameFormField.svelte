<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import FormFieldError from '$lib/components/FormFieldError'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  let modalOpen = $state(false)

  const { t } = getI18n()
</script>

<label class="label mt-4">
  <span>
    {t('common.name')}

    <Dialog
      open={modalOpen}
      onOpenChange={(event) => (modalOpen = event.open)}
      title={t('routes.namingGuidelines.title')}
    >
      {#snippet trigger()}<i class="sl-2 fa-regular fa-circle-question"></i>{/snippet}

      {#snippet content()}
        <p class="font-semibold">{t('routes.namingGuidelines.intro')}</p>

        <ul class="mt-4 list-inside list-disc space-y-2">
          <li>{t('routes.namingGuidelines.items.respectfulInclusive')}</li>
          <li>{t('routes.namingGuidelines.items.respectfulInclusive')}</li>
          <li>{t('routes.namingGuidelines.items.respectfulInclusive')}</li>
          <li>{t('routes.namingGuidelines.items.ageAppropriate')}</li>
          <li>{t('routes.namingGuidelines.items.respectLocalCultures')}</li>
          <li>{t('routes.namingGuidelines.items.considerNamingThemes')}</li>
          <li>{t('routes.namingGuidelines.items.ensureUniqueWithinArea')}</li>
          <li>{t('routes.namingGuidelines.items.appropriateForPublicDisplay')}</li>
        </ul>

        <p class="mt-4 italic">{t('routes.namingGuidelines.reminder')}</p>
      {/snippet}
    </Dialog>
  </span>

  <input
    class="input"
    aria-errormessage={field.issues() == null ? undefined : 'route-form-name-error'}
    placeholder={t('routes.leaveEmptyIfUnknown')}
    {...field.as('text')}
  />

  <FormFieldError id="route-form-name-error" issues={field.issues()} />
</label>
