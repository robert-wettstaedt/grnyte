<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import type { ItemProps } from '../Item/Item.svelte'
  import UserLink from '../UserLink'

  const { activity, withDetails }: Pick<ItemProps, 'activity' | 'withDetails'> = $props()

  const { t } = $derived(getI18n())
</script>

{#if withDetails}
  <span class="font-semibold">
    {#if activity.user == null}
      {t('activity.someone')}
    {:else}
      <UserLink user={activity.user} />
    {/if}
  </span>
{/if}
