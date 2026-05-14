<script lang="ts">
  import FileUpload, { type FileUploadProps } from '$lib/components/FileUpload'
  import type { BlockActionValuesIn } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormFields } from '@sveltejs/kit'
  import FormFieldError from '../FormFieldError'

  interface Props {
    fields: RemoteFormFields<BlockActionValuesIn>
    fileUploadProps?: FileUploadProps
  }

  let { fields, fileUploadProps }: Props = $props()

  const { t } = getI18n()
</script>

{#if fields.areaId.value() != null}
  <input type="hidden" {...fields.areaId.as('text')} />
{/if}

<label class="label">
  <span>{t('common.name')}</span>
  <input
    class="input"
    aria-errormessage={fields.name.issues() == null ? undefined : 'block-form-fields-name-error'}
    placeholder={t('common.enterName')}
    {...fields.name.as('text')}
  />

  <FormFieldError id="block-form-fields-name-error" issues={fields.name.issues()} />
</label>

{#if fileUploadProps != null}
  <FileUpload accept="image/*" label={t('blocks.topoImage')} {...fileUploadProps} />
{/if}
