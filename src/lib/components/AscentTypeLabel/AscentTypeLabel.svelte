<script lang="ts">
  import type { Ascent } from '$lib/db/schema'
  import { getI18n } from '$lib/i18n'

  interface Props {
    type: Ascent['type']
    includeIcon?: boolean
    includeText?: boolean
  }

  let { type, includeIcon = true, includeText = true }: Props = $props()
  const { t } = getI18n()
</script>

{#if type === 'flash'}
  {#if includeIcon}
    <i class="fa-solid fa-bolt-lightning text-yellow-300 {includeText ? 'me-1' : ''}"></i>
  {/if}
{:else if type === 'send'}
  {#if includeIcon}
    <i class="fa-solid fa-circle text-red-500 {includeText ? 'me-1' : ''}"></i>
  {/if}
{:else if type === 'repeat'}
  {#if includeIcon}
    <i class="fa-solid fa-repeat text-green-500 {includeText ? 'me-1' : ''}"></i>
  {/if}
{:else if includeIcon}
  <i class="fa-solid fa-person-falling text-blue-3000 {includeText ? 'me-1' : ''}"></i>
{/if}

{#if includeText}
  {t(`ascents.types.${type}`)}
{/if}
