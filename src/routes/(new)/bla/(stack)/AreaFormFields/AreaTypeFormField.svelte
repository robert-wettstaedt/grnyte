<script lang="ts">
  import BottomSheetPanel from '$lib/components/BottomSheetPanel'
  import FormFieldError from '$lib/components/FormFieldError'
  import type { Row } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  let isSheetOpen = $state(false)

  const options: Row<'areas'>['type'][] = ['area', 'crag', 'sector']

  const { t } = getI18n()
</script>

<label class="label mt-3">
  <span>
    {t('common.type')}

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

  <input id={field.issues() == null ? undefined : 'area-form-fields-type-error'} type="hidden" {...field.as('text')} />

  <div>
    <nav class="btn-group preset-outlined-surface-200-800">
      {#each options as option (option)}
        <button
          class={['btn capitalize', field.value() === option && 'preset-filled']}
          onclick={() => field.set(option ?? undefined)}
          type="button"
        >
          {t(`entities.${option}`)}
        </button>
      {/each}
    </nav>
  </div>

  <FormFieldError id="area-form-fields-type-error" issues={field.issues()} />
</label>

<BottomSheetPanel bind:isSheetOpen autoHeight showOverlay title={t('areas.areaType')}>
  <div class="flex flex-wrap justify-around gap-2">
    <ul class="mt-4 list-inside list-disc space-y-2">
      <li>{t('areas.typeDescription.sector')}</li>
      <li>{t('areas.typeDescription.crag')}</li>
      <li>{t('areas.typeDescription.area')}</li>
    </ul>
  </div>
</BottomSheetPanel>
