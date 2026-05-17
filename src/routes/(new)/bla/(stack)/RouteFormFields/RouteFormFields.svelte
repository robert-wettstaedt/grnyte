<script lang="ts">
  import FormFieldError from '$lib/components/FormFieldError'
  import GradeFormField from '$lib/components/GradeFormField'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import type { RouteActionValuesIn } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormFields } from '@sveltejs/kit'
  import RouteNameFormField from './RouteNameFormField.svelte'
  import ButtonSelect from '$lib/components/ButtonSelect'

  interface Props {
    fields: RemoteFormFields<RouteActionValuesIn>
  }

  let { fields }: Props = $props()

  const { t } = getI18n()
</script>

<input type="hidden" {...fields.blockId.as('text')} />

<fieldset class="card preset-filled-surface-100-900 relative mx-3 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.basics')}
  </legend>

  <RouteNameFormField field={fields.name} />

  <GradeFormField field={fields.gradeFk} />

  <RatingFormField field={fields.rating} />
</fieldset>

<fieldset class="card preset-filled-surface-100-900 relative mx-3 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.description')}
  </legend>

  <textarea
    aria-errormessage={fields.description.issues() == null ? undefined : 'route-form-description-error'}
    hidden
    {...fields.description.as('text')}
  ></textarea>

  <MarkdownEditor onchange={(value) => fields.description.set(value)} value={fields.description.value()} />

  <FormFieldError id="route-form-description-error" issues={fields.description.issues()} />
</fieldset>

<fieldset class="card preset-filled-surface-100-900 relative mx-3 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.tags')}
  </legend>

  <ButtonSelect
    aria-errormessage={fields.tags.issues() == null ? undefined : 'route-form-tags-error'}
    field={fields.tags}
    options={pageState.tags.map((tag) => ({ value: tag.id, label: tag.id }))}
    multiple
  />

  <FormFieldError id="route-form-tags-error" issues={fields.tags.issues()} />
</fieldset>
