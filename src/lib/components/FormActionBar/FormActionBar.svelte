<script lang="ts">
  import { processFileUpload } from '$lib/components/FileUpload/enhance.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import type { Snippet } from 'svelte'

  interface Props {
    buttons?: Snippet
    disabled?: boolean
    label: string
    pending: number
    state?: EnhanceState
  }

  const { buttons, disabled = false, label, pending, state }: Props = $props()

  const { t } = getI18n()
</script>

<div class="mt-8 flex items-start justify-between md:items-center">
  <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">
    {t('common.cancel')}
  </button>

  <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
    {#if buttons}
      {@render buttons()}
    {/if}

    <button
      class="btn preset-filled-primary-500"
      type="submit"
      disabled={pending > 0 || disabled}
      onclick={async (event) => {
        event.preventDefault()
        const form = event.currentTarget.form

        if (form != null && state != null) {
          await processFileUpload(form, state)
        }

        form?.requestSubmit()
      }}
    >
      {#if pending > 0}
        <LoadingIndicator />
      {/if}

      {label}
    </button>
  </div>
</div>
