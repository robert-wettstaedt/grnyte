<script lang="ts">
  import JsonEditor from '$lib/components/JSONEditor'
  import { regionSettingsSchema, type RegionActionValues } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormFields } from '@sveltejs/kit'
  import FormFieldError from '../FormFieldError'

  interface Props {
    fields: RemoteFormFields<RegionActionValues>
    onChange?: (isValid: boolean) => void
  }

  let { fields, onChange }: Props = $props()

  const { t } = getI18n()
</script>

<label class="label">
  <span>{t('common.name')}</span>
  <input
    aria-errormessage={fields.name.issues() == null ? undefined : 'region-form-name-error'}
    class="input"
    placeholder={t('common.enterName')}
    {...fields.name.as('text')}
  />

  <FormFieldError id="region-form-name-error" issues={fields.name.issues()} />
</label>

<label class="label mt-4">
  <span>{t('common.settings')}</span>
  <input type="hidden" {...fields.settings.as('text')} />
</label>

<JsonEditor
  onChange={(value, isValid) => {
    fields.settings.set(value == null ? undefined : JSON.stringify(value))
    onChange?.(isValid)
  }}
  schema={regionSettingsSchema}
  value={fields.settings.value()}
/>

<FormFieldError id="region-form-settings-error" issues={fields.settings.issues()} />
