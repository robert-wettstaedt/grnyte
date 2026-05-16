<script lang="ts">
  import FileUpload, { type FileUploadProps } from '$lib/components/FileUpload'
  import FormFieldError from '$lib/components/FormFieldError'
  import type { BlockActionValuesIn } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormFields } from '@sveltejs/kit'

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

<fieldset class="card preset-filled-surface-100-900 relative mx-3 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.basics')}
  </legend>

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
</fieldset>
