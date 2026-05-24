<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { type EnhanceState } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { processFileUpload } from '../FileUpload/enhance.svelte'
  import StackAppBar from './StackAppBar.svelte'

  interface Props {
    disabled?: boolean
    form: HTMLFormElement | undefined
    title: string
    subtitle?: string
    pending: number
    state?: EnhanceState
  }

  const { form, disabled = false, pending, state, subtitle, title }: Props = $props()

  const { t } = getI18n()
</script>

<StackAppBar {title} {subtitle}>
  <AppBar.Trail>
    <button
      disabled={disabled || state?.loading || pending > 0}
      class="btn-icon preset-filled-primary-500"
      onclick={async (event) => {
        event.preventDefault()

        if (form != null && state != null) {
          await processFileUpload(form, state)
        }

        form?.requestSubmit()
      }}
      title={t('common.save')}
    >
      {#if state?.loading || pending > 0}
        <LoadingIndicator />
      {:else}
        <i class="fa-solid fa-floppy-disk"></i>
      {/if}
    </button>
  </AppBar.Trail>
</StackAppBar>
