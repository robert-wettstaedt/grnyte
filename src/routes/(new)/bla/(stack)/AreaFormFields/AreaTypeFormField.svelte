<script lang="ts">
  import FormFieldError from '$lib/components/FormFieldError'
  import Modal from '$lib/components/Modal'
  import type { Row } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  let open = $state(false)

  const options: Row<'areas'>['type'][] = ['area', 'crag', 'sector']

  const { t } = getI18n()
</script>

<label class="label mt-3">
  <span>
    {t('common.type')}

    <Modal bind:open title={t('areas.areaType')}>
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

      <div class="flex flex-wrap justify-around gap-2">
        <ul class="mt-4 list-inside list-disc space-y-2">
          <li>{t('areas.typeDescription.sector')}</li>
          <li>{t('areas.typeDescription.crag')}</li>
          <li>{t('areas.typeDescription.area')}</li>
        </ul>
      </div>
    </Modal>
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
