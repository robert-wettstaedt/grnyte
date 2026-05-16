<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { type EnhanceState } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import { processFileUpload } from '../FileUpload/enhance.svelte'

  interface Props {
    buttons?: Snippet
    disabled?: boolean
    form: HTMLFormElement | undefined
    title: string
    subtitle?: string
    pending: number
    state?: EnhanceState
  }

  const { buttons, form, disabled = false, pending, state, subtitle, title }: Props = $props()

  const { t } = getI18n()
</script>

<AppBar
  class="preset-filled-surface-100-900 md:border-surface-50-950 fixed top-0 z-10 rounded-b-xl md:right-0 md:left-25 md:w-auto md:border-l-2"
>
  <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
    <AppBar.Lead>
      <button type="button" class="btn-icon" onclick={() => history.back()} title={t('common.back')}>
        <i class="fa-solid fa-arrow-left"></i>
      </button>
    </AppBar.Lead>

    <AppBar.Headline class="flex-col">
      <span class="leading-none">
        {title}
      </span>

      {#if subtitle}
        <span class="text-surface-500 text-xs leading-none">
          {subtitle}
        </span>
      {/if}
    </AppBar.Headline>

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
  </AppBar.Toolbar>
</AppBar>
