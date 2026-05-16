<script lang="ts">
  import FormFieldError from '$lib/components/FormFieldError'
  import GradeFormField from '$lib/components/GradeFormField'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import type { RouteActionValuesIn } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormFields } from '@sveltejs/kit'
  import RouteNameFormField from './components/RouteNameFormField'

  interface Props {
    fields: RemoteFormFields<RouteActionValuesIn>
  }

  let { fields }: Props = $props()

  const { t } = getI18n()
</script>

<input type="hidden" {...fields.blockId.as('text')} />

<RouteNameFormField field={fields.name} />

<GradeFormField field={fields.gradeFk} />

<RatingFormField field={fields.rating} />

<label class="label mt-4">
  <span>{t('common.description')}</span>
  <textarea
    aria-errormessage={fields.description.issues() == null ? undefined : 'route-form-description-error'}
    hidden
    {...fields.description.as('text')}
  ></textarea>

  <MarkdownEditor onchange={(value) => fields.description.set(value)} value={fields.description.value()} />

  <FormFieldError id="route-form-description-error" issues={fields.description.issues()} />
</label>

<label class="label mt-4">
  <span>{t('common.tags')}</span>

  <select
    aria-errormessage={fields.tags.issues() == null ? undefined : 'route-form-tags-error'}
    class="select max-h-75 overflow-auto"
    {...fields.tags.as('select multiple')}
  >
    {#each pageState.tags as tag}
      <option class="rounded p-1" value={tag.id}>{tag.id}</option>
    {/each}
  </select>

  <FormFieldError id="route-form-tags-error" issues={fields.tags.issues()} />
</label>
