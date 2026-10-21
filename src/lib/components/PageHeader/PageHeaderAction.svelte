<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'

  // The trailing button of a PageHeader task bar (submit, done, next). A component rather than
  // markup each caller repeats, because the three screens that hand-rolled it drifted into three
  // different buttons: label-only, icon-only, and icon plus label.
  interface Props {
    /** An irreversible action: the error tone and a trash icon, so it never reads as a save. */
    destructive?: boolean
    disabled?: boolean
    icon?: IconName
    /** Put the icon after the label. For "next", which points forward. */
    iconAfter?: boolean
    label: string
    onclick?: () => void
    /** Swap the icon for a spinner. Does not disable on its own; pass `disabled` too. */
    pending?: boolean
    type?: 'button' | 'submit'
  }

  const {
    destructive = false,
    disabled = false,
    icon = destructive ? 'trash' : 'check',
    iconAfter = false,
    label,
    onclick,
    pending = false,
    type = 'button',
  }: Props = $props()
</script>

<!-- Icon-only below sm, icon plus label from sm up, matching the back chip opposite it: German
     labels ("Abbrechen", "Speichern") ate so much of a phone-width bar that the title truncated. -->
<button
  class={[
    'btn size-8 flex-none px-0 sm:size-auto sm:px-4',
    destructive ? 'preset-filled-error-500' : 'preset-filled-primary-500',
  ]}
  {disabled}
  {onclick}
  {type}
  aria-label={label}
>
  {#if iconAfter}
    <span class="hidden sm:inline">{label}</span>
  {/if}

  {#if pending}
    <LoadingIndicator class="items-center justify-center" />
  {:else}
    <Icon name={icon} size={18} />
  {/if}

  {#if !iconAfter}
    <span class="hidden sm:inline">{label}</span>
  {/if}
</button>
