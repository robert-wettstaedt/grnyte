<script lang="ts">
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import type { FileUploadProps } from '$lib/components/FileUpload'
  import FileUpload from '$lib/components/FileUpload'
  import FormFieldError from '$lib/components/FormFieldError'
  import GradeFormField from '$lib/components/GradeFormField'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import { ascentTypeEnum } from '$lib/db/schema'
  import type { AscentActionValuesIn } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormFields } from '@sveltejs/kit'
  import { DateTime } from 'luxon'
  import ConditionsFields from './ConditionsFields.svelte'

  interface Props {
    fields: RemoteFormFields<AscentActionValuesIn>
    fileUploadProps: FileUploadProps
  }

  let { fields, fileUploadProps }: Props = $props()

  const { t } = getI18n()
</script>

<label class="label mt-4">
  <span>{t('common.type')}</span>

  <div class="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
    {#each ascentTypeEnum as ascentType}
      <label
        aria-errormessage={fields.type.issues() == null ? undefined : 'ascent-form-type-error'}
        class={[
          'flex cursor-pointer items-center justify-center rounded-md border-2 p-2 transition-colors md:p-4',
          fields.type.value() === ascentType
            ? 'bg-primary-500 border-primary-500'
            : 'border-surface-500 bg-transparent',
        ]}
      >
        <input class="hidden" {...fields.type.as('radio', ascentType)} />
        <AscentTypeLabel type={ascentType} />
      </label>
    {/each}
  </div>

  <FormFieldError id="ascent-form-type-error" issues={fields.type.issues()} />
</label>

<GradeFormField field={fields.gradeFk} />

<RatingFormField field={fields.rating} />

<label class="label mt-4">
  <span>{t('common.date')}</span>
  <input
    aria-errormessage={fields.dateTime.issues() == null ? undefined : 'ascent-form-date-error'}
    class="input"
    max={DateTime.now().toISODate()}
    {...fields.dateTime.as('date')}
  />

  <FormFieldError id="ascent-form-date-error" issues={fields.dateTime.issues()} />
</label>

<ConditionsFields humidityField={fields.humidity} temperatureField={fields.temperature} />

<FileUpload {...fileUploadProps} />

<label class="label mt-4">
  <span>{t('common.notes')}</span>
  <textarea
    aria-errormessage={fields.notes.issues() == null ? undefined : 'ascent-form-notes-error'}
    hidden
    {...fields.notes.as('text')}
  ></textarea>

  <MarkdownEditor onchange={(value) => fields.notes.set(value)} value={fields.notes.value()} />

  <FormFieldError id="ascent-form-notes-error" issues={fields.notes.issues()} />
</label>
