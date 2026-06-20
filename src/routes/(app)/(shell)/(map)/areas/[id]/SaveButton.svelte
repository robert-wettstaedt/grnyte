<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { toggleFavorite } from '$lib/entities/favorite/favorites.remote'
  import { isFavorited, otherSaveCount } from '$lib/entities/favorite/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    entityId: string
    entityType: 'block' | 'route' | 'area'
    regionFk: number
  }

  const { entityId, entityType, regionFk }: Props = $props()
  const global = getGlobalState()

  // Saved state is read reactively from Zero, but the write goes through a
  // remote command (not a Zero mutator) so it won't reflect optimistically. We
  // pin the user's intent in `savedOverride` for an instant toggle; it always
  // converges with the synced value (and reverts on failure).
  const favorited = isFavorited(
    () => global.user?.id,
    () => entityType,
    () => entityId,
  )
  let savedOverride = $state<boolean | undefined>(undefined)
  const saved = $derived(savedOverride ?? favorited.data)

  const others = otherSaveCount(
    () => global.user?.id,
    () => entityType,
    () => entityId,
  )

  const toggleSave = async () => {
    const next = !saved
    savedOverride = next
    try {
      await toggleFavorite({ entityId, entityType, regionFk })
    } catch {
      savedOverride = !next
    }
  }
</script>

<button
  aria-pressed={saved}
  class={['btn btn-lg text-base', saved ? 'preset-tonal-primary' : 'preset-tonal']}
  disabled={favorited.isSyncing}
  onclick={toggleSave}
  type="button"
>
  {#if favorited.isSyncing}
    <LoadingIndicator size="19px" />
  {:else}
    <Icon name="bookmark" fill={saved ? 'currentColor' : 'none'} size={19} />
  {/if}

  <!-- Tight leading keeps the stacked label + count within the button's text-base line
       height, so the count fills that line rather than growing the row (no shift), while
       the label still centres on its own when nobody else has saved yet. -->
  <span class="flex flex-col items-start leading-none">
    <span class="text-sm leading-none">{saved ? m.common_saved() : m.common_save()}</span>
    {#if others.data > 0}
      <span class="text-[10px] leading-none font-normal opacity-80">
        {m.common_savedByOthers({ count: others.data })}
      </span>
    {/if}
  </span>
</button>
