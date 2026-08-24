<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { toggleFavorite } from '$lib/entities/favorite/favorites.remote'
  import { isFavorited, otherSaveCount } from '$lib/entities/favorite/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { isOnline } from '$lib/state/online.svelte'

  interface Props {
    class?: string
    entityId: number
    entityType: 'area' | 'block' | 'route'
  }

  const { class: className, entityId, entityType }: Props = $props()
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

  /**
   * Waiting on a first answer, which is only ever true while there is a server to answer.
   *
   * `availability`, not `isSyncing`. Syncing is a fact about the transport: a query reports
   * `complete` only while the server has confirmed it, and Zero clears that on every disconnect
   * including the one it performs itself after five minutes in a background tab. So a button that
   * had settled would start spinning again because the phone went in a pocket. `loading` is the
   * question actually being asked here, and the resource only reports it while online.
   *
   * Offline we show what the local replica knows and disable the write, which is the honest state
   * either way: `toggleFavorite` is a remote function and cannot land without a connection.
   */
  const pending = $derived(favorited.availability === 'loading')

  const toggleSave = async () => {
    const next = !saved
    savedOverride = next
    try {
      // The handler's answer, not the request's. The flip above is optimistic, and this is the
      // state the row is actually in once the write lands.
      const result = await toggleFavorite({ entityId, entityType })
      savedOverride = result?.data ?? next
    } catch {
      savedOverride = !next
    }
  }
</script>

<button
  aria-pressed={saved}
  class={['btn btn-lg text-base', saved ? 'preset-tonal-primary' : 'preset-tonal', className]}
  disabled={pending || !isOnline()}
  onclick={toggleSave}
  type="button"
>
  {#if pending}
    <LoadingIndicator size="19px" />
  {:else}
    <Icon name="bookmark" fill={saved ? 'currentColor' : 'none'} size={19} />
  {/if}

  <!-- Tight leading keeps the stacked label + count within the button's text-base line
       height, so the count fills that line rather than growing the row (no shift), while
       the label still centres on its own when nobody else has saved yet. -->
  <span class="flex flex-col items-start leading-none">
    <span class="text-sm leading-none font-bold">{saved ? m.common_saved() : m.common_save()}</span>
    {#if others.data > 0}
      <span class="text-[10px] leading-none font-normal opacity-80">
        {m.common_savedByOthers({ count: others.data })}
      </span>
    {/if}
  </span>
</button>
