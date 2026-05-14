<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import type { Route } from '$lib/db/schema'
  import { getI18n } from '$lib/i18n'

  interface Props {
    value: Route['rating'] | null | undefined
  }

  let { value = $bindable() }: Props = $props()

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

  <input name="rating" type="hidden" {value} />
</label>

<div class="flex h-10 items-center justify-between">
  <div class="flex gap-1">
    {#each [1, 2, 3] as rating}
      <button
        aria-label={`${t('common.rating')} ${rating}`}
        title={`${t('common.rating')} ${rating}`}
        onclick={(event) => {
          event.preventDefault()
          value = rating
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
      onclick={() => (value = null)}
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  {/if}
</div>
