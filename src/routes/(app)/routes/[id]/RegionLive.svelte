<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { canEditRegion } from '$lib/entities/region/permissions'
  import { routeMapList } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  /**
   * The end of the onboarding chain: the founder just made the first route in their region, so the
   * region is now a real, shareable thing. Sits on top of the route they built rather than
   * replacing it, so the celebration has the work behind it.
   *
   * Fires when the region holds exactly one route, which is one-shot by construction; the
   * dismissal flag covers reloads before a second route exists.
   */
  interface Props {
    regionFk: number
  }

  const { regionFk }: Props = $props()

  const global = getGlobalState()

  // Scoped to this region, and the map's bare projection (id, block, grade) so counting costs
  // nothing extra. Unscoped it counted every route the viewer could see anywhere, which for
  // anybody already in a populated region is never 1. `pageSize: 2` because "exactly one" is all
  // this asks: without it, opening any route in a 5000-route region synced all 5000 rows to
  // evaluate a length check.
  const routes = routeMapList(() => ({ pageSize: 2, regionFk }))

  const region = $derived(global.userRegions.find((membership) => membership.regionFk === regionFk))

  // localStorage, not a column: one bit of "already celebrated" does not deserve a migration, and
  // losing it on a new device costs one dismissed card. Writable derived rather than state+effect,
  // so it is read before the first paint and re-reads if the region changes under it.
  const storageKey = $derived(`${PUBLIC_APPLICATION_NAME}:regionLive:${regionFk}`)
  let seen = $derived(localStorage.getItem(storageKey) != null)

  // Deliberately no member-count condition. It was there to avoid celebrating in an established
  // region, but a region holding exactly one route is brand new by definition, and the check only
  // ever produced false negatives: a founder who invites people before adding the first route
  // would never have seen this.
  //
  // Admin-gated, because the only thing this card offers is the region's settings screen, which
  // `canEditRegion` keeps to admins: a member invited as `region_user` got congratulated on
  // somebody else's region and sent to a page they cannot open.
  //
  // `isComplete`, not `status === 'ready'`: a resource reports ready as soon as the local replica
  // has any row, and on a cold load of /routes/[id] the route's own row is already there (its
  // detail query synced it) while the region-wide count is still coming in. That transient
  // `length === 1` popped this at members of long-established regions.
  const show = $derived(
    !seen && canEditRegion(global.userRegions, regionFk) && routes.isComplete && routes.data.length === 1,
  )

  const dismiss = () => {
    localStorage.setItem(storageKey, '1')
    seen = true
  }
</script>

{#if show}
  <!-- ponytail: the native dialog, not the Skeleton one. It brings the focus trap, Escape and the
       backdrop for free, and Dialog.Description renders its content at 60% opacity, which is wrong
       for a card whose whole job is one bright call to action. -->
  <dialog
    class="bg-surface-100-900 text-surface-950-50 backdrop:bg-surface-50-950/60 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl p-6 shadow-xl backdrop:backdrop-blur-sm"
    onclose={dismiss}
    {@attach (node) => node.showModal()}
  >
    <div class="flex flex-col items-center text-center">
      <span class="bg-primary-500/15 text-primary-400 flex size-15 items-center justify-center rounded-2xl">
        <Icon name="tent-tree" size={27} />
      </span>

      <h2 class="mt-4 text-xl font-bold tracking-tight">{m.region_live_title({ name: region?.name ?? '' })}</h2>
      <p class="text-surface-600-400 mt-2 max-w-70 text-pretty">{m.region_live_body()}</p>

      <a
        class="btn preset-filled-primary-500 mt-5 h-13 w-full rounded-2xl text-base font-bold shadow-[0_10px_24px_-10px_var(--color-primary-500)]"
        href={resolve('/(app)/settings/regions/[regionId]', { regionId: String(regionFk) })}
        onclick={dismiss}
      >
        <Icon name="users-round" size={20} />
        {m.region_live_invite()}
      </a>

      <button
        class="text-surface-600-400 hover:text-surface-950-50 mt-1 px-4 py-3 text-sm font-medium"
        onclick={dismiss}
      >
        {m.region_live_dismiss()}
      </button>
    </div>
  </dialog>
{/if}
