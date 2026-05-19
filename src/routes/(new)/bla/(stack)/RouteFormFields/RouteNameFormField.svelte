<script lang="ts">
  import FormFieldError from '$lib/components/FormFieldError'
  import Modal from '$lib/components/Modal'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  let open = $state(false)

  const { t } = getI18n()
</script>

<label class="label">
  <span>
    {t('common.name')}

    <Modal bind:open title={t('routes.namingGuidelines.title')}>
      {#snippet trigger(props)}
        <button
          {...props}
          aria-label={t('areas.areaType')}
          class={[props.class, 'btn-icon']}
          onclick={(event) => {
            event.preventDefault()
            open = true
          }}
        >
          <i class="fa-regular fa-circle-question"></i>
        </button>
      {/snippet}

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
    </Modal>
  </span>

  <input
    class="input"
    aria-errormessage={field.issues() == null ? undefined : 'route-form-name-error'}
    placeholder={t('routes.leaveEmptyIfUnknown')}
    {...field.as('text')}
  />

  <FormFieldError id="route-form-name-error" issues={field.issues()} />
</label>
