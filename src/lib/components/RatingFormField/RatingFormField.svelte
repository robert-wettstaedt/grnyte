<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormField } from '@sveltejs/kit'
  import FormFieldError from '../FormFieldError'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  const value = $derived.by(() => {
    const val = Number(field.value())
    return Number.isNaN(val) ? null : val
  })

  const { t } = getI18n()
  let modalOpen = $state(false)
</script>

<label class="label mt-4 mb-2">
  <span>
    {t('common.rating')}

    <Dialog open={modalOpen} onOpenChange={(event) => (modalOpen = event.open)} title={t('rating.title')}>
      {#snippet trigger()}<i class="sl-2 fa-regular fa-circle-question"></i>{/snippet}

      {#snippet content()}
        <p>{t('rating.description')}</p>

        <ul class="mt-4 list-inside list-disc">
          <li>{t('rating.factors.rockQuality')}</li>
          <li>{t('rating.factors.landingQuality')}</li>
          <li>{t('rating.factors.climbingMovement')}</li>
          <li>{t('rating.factors.surroundingBeauty')}</li>
          <li>{t('rating.factors.topoutOrDropoff')}</li>
        </ul>
      {/snippet}
    </Dialog>
  </span>

  <input aria-errormessage={field.issues() == null ? undefined : 'rating-error'} type="hidden" {...field.as('text')} />
</label>

<div class="flex h-10 items-center justify-between">
  <div class="flex gap-1">
    {#each [1, 2, 3] as rating}
      <button
        aria-label={`${t('common.rating')} ${rating}`}
        title={`${t('common.rating')} ${rating}`}
        onclick={(event) => {
          event.preventDefault()
          field.set(rating.toString())
        }}
      >
        {#if value != null && value >= rating}
          <i class="fa-solid fa-star text-warning-500 text-3xl"></i>
        {:else}
          <i class="fa-regular fa-star text-warning-500 text-3xl"></i>
        {/if}
      </button>
    {/each}
  </div>

  {#if value != null}
    <button
      aria-label={t('common.clear')}
      title={t('common.clear')}
      class="btn preset-filled-surface-500 h-9 w-9"
      onclick={() => field.set(undefined)}
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  {/if}
</div>

<FormFieldError id="rating-error" issues={field.issues()} />
