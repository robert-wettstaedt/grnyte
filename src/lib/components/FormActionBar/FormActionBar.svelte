<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getI18n } from '$lib/i18n'
  import LoadingIndicator from '../LoadingIndicator'

  interface Props {
    buttons?: Snippet
    disabled?: boolean
    label: string
    pending: number
  }

  const { buttons, disabled = false, label, pending }: Props = $props()

  const { t } = $derived(getI18n())
</script>

<div class="mt-8 flex items-start justify-between md:items-center">
  <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">{t('common.cancel')}</button>

  <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
    {#if buttons}
      {@render buttons()}
    {/if}

    <button class="btn preset-filled-primary-500" type="submit" disabled={pending > 0 || disabled}>
      {#if pending > 0}
        <LoadingIndicator />
      {/if}

      {label}
    </button>
  </div>
</div>
