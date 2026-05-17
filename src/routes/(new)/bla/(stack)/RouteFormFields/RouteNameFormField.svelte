<script lang="ts">
  import BottomSheetPanel from '$lib/components/BottomSheetPanel'
  import FormFieldError from '$lib/components/FormFieldError'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  let isSheetOpen = $state(false)

  const { t } = getI18n()
</script>

<label class="label">
  <span>
    {t('common.name')}

    <button
      class="btn-icon"
      aria-label={t('areas.areaType')}
      onclick={(event) => {
        event.preventDefault()
        isSheetOpen = true
      }}
    >
      <i class="fa-regular fa-circle-question"></i>
    </button>
  </span>

  <input
    class="input"
    aria-errormessage={field.issues() == null ? undefined : 'route-form-name-error'}
    placeholder={t('routes.leaveEmptyIfUnknown')}
    {...field.as('text')}
  />

  <FormFieldError id="route-form-name-error" issues={field.issues()} />
</label>

<BottomSheetPanel bind:isSheetOpen autoHeight showOverlay title={t('routes.namingGuidelines.title')}>
  <div class="mt-4 flex flex-wrap justify-around gap-2">
    <p class="font-semibold">{t('routes.namingGuidelines.intro')}</p>

    <ul class="mt-4 list-inside list-disc space-y-2">
      <li>{t('routes.namingGuidelines.items.respectfulInclusive')}</li>
      <li>{t('routes.namingGuidelines.items.ageAppropriate')}</li>
      <li>{t('routes.namingGuidelines.items.respectLocalCultures')}</li>
      <li>{t('routes.namingGuidelines.items.considerNamingThemes')}</li>
      <li>{t('routes.namingGuidelines.items.ensureUniqueWithinArea')}</li>
      <li>{t('routes.namingGuidelines.items.appropriateForPublicDisplay')}</li>
    </ul>

    <p class="mt-4 italic">{t('routes.namingGuidelines.reminder')}</p>
  </div>
</BottomSheetPanel>
