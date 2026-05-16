<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import FormFieldError from '$lib/components/FormFieldError'
  import { pageState } from '$lib/components/Layout'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import type { AreaActionValuesIn } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormFields } from '@sveltejs/kit'
  import AreaTypeFormField from './AreaTypeFormField.svelte'

  interface Props {
    fields: RemoteFormFields<AreaActionValuesIn>
  }

  let { fields }: Props = $props()

  const { t } = getI18n()
</script>

{#if fields.id.value() != null}
  <input type="hidden" {...fields.id.as('text')} />
{/if}

<fieldset class="card preset-filled-surface-100-900 relative mx-3 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.basics')}
  </legend>

  <label class="label">
    <span>{t('common.name')}</span>
    <input
      aria-errormessage={fields.name.issues() ? 'area-form-fields-name-error' : undefined}
      class="input"
      placeholder={t('common.enterName')}
      {...fields.name.as('text')}
    />

    <FormFieldError id="area-form-fields-name-error" issues={fields.name.issues()} />
  </label>

  <hr class="text-surface-200-800 -mx-3 mt-4" />

  {#if fields.parentFk.value() == null}
    <label class="label mt-4">
      <span>{t('common.region')}</span>
      <select
        aria-errormessage={fields.regionFk.issues() ? 'area-form-fields-region-error' : undefined}
        class="select"
        {...fields.regionFk.as('select')}
      >
        <option disabled value="">{t('common.selectRegion')}</option>
        {#each pageState.userRegions as region}
          <option
            disabled={!checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], region.regionFk)}
            value={String(region.regionFk)}
          >
            {region.name}
          </option>
        {/each}
      </select>

      <FormFieldError id="area-form-fields-region-error" issues={fields.regionFk.issues()} />
    </label>
  {:else}
    <AreaTypeFormField field={fields.type} />

    <input type="hidden" {...fields.parentFk.as('text')} />
    <input type="hidden" {...fields.regionFk.as('text')} />
  {/if}
</fieldset>

<fieldset class="card preset-filled-surface-100-900 relative mx-3 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.description')}
  </legend>

  <textarea
    aria-errormessage={fields.description.issues() ? 'area-form-fields-description-error' : undefined}
    hidden
    {...fields.description.as('text')}
  ></textarea>

  <MarkdownEditor onchange={(value) => fields.description.set(value)} value={fields.description.value()} />

  <FormFieldError id="area-form-fields-description-error" issues={fields.description.issues()} />
</fieldset>
