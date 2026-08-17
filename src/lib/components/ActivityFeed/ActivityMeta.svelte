<!--
  The one line a detail page carries about its own record: who last touched it, and when.
  Tapping it opens the full audit log.

  Deliberately not a feed of everything under the entity. A crag's blocks, a block's routes
  and a route's ascents all name it as their parent, and none of them is a change to it; the
  question this answers is "when was this last edited", which is the one the page cannot
  answer from anything else it renders.
-->
<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Row from '$lib/components/EntityRow/Row.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { ActivityEntityType } from '$lib/entities/activity/dto'
  import { activityMeta } from '$lib/entities/activity/meta'
  import { legacyEvent } from '$lib/entities/event/legacy'
  import { eventList } from '$lib/entities/event/resources.svelte'
  import { usersByIds } from '$lib/entities/user/resources.svelte'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { now } from '$lib/state/now.svelte'
  import ActivityLog from './ActivityLog.svelte'

  interface Props {
    /**
     * This row sits inside the explore panel, so on desktop the log opens as a second panel
     * beside it rather than as a right-hand aside. Mirrors `MoreMenu`'s `panel`, which the same
     * area and block pages already use; the route page is standalone and leaves it off.
     */
    beside?: boolean
    /** The entity's own creation stamp, off its DTO. */
    createdAt: Date | undefined
    /** The entity's own creator, off its DTO. Resolved to a name only when the log is empty. */
    createdBy: number
    /** Whether the log mounts the media viewer. Off where the host page already has one. */
    lightbox?: boolean
    /** Whether the log is up, for a host that has to stand down while it is (see the route page). */
    open?: boolean
    /**
     * The scope, as two primitives rather than an object. The object is built here, so it keeps
     * its identity while the host's DTO is replaced on every Zero emit: `activityFeed` resets its
     * window and its acknowledged mark whenever its filter changes, and a reader who had loaded
     * four pages would be thrown back to the newest one by an edit somebody else made.
     */
    scopeId: string
    scopeType: ActivityEntityType
  }

  let {
    beside = false,
    createdAt,
    createdBy,
    lightbox = true,
    open = $bindable(false),
    scopeId,
    scopeType,
  }: Props = $props()

  const scope = $derived({ id: scopeId, type: scopeType })
  /** The same identity as a value, for the one place that has to compare rather than pass it on. */
  const scopeKey = $derived(`${scopeType}:${scopeId}`)

  // One row is the whole question. The sheet opens its own window when it opens, so a reader
  // who never taps this never syncs the log.
  const latest = eventList(() => ({ limit: 1, scope }))
  // Through the catalogue adapter, because `activityMeta` reads the old triple. It only asks
  // whether the newest row is the record appearing or a change to it, which `legacyEvent` answers
  // the same way for an event as the row it replaced.
  const latestRow = $derived(latest.data[0] == null ? undefined : legacyEvent(latest.data[0]))

  // Only ever needed when the log came back empty, which is the one case the row cannot answer
  // from a row's own `user` relation. An empty id list is how a resource is switched off here.
  const creator = usersByIds(() => (latest.status === 'ready' && latest.data.length === 0 ? [createdBy] : []))

  // Held back until the log has answered. Deciding early would read the entity's own stamp,
  // say "Created ...", and then flip to "Updated ..." a tick later.
  const line = $derived(
    latest.status !== 'ready'
      ? undefined
      : activityMeta({ createdAt, creatorName: creator.data[0]?.username, latest: latestRow, now: now() }),
  )

  const label = $derived(
    line == null
      ? undefined
      : resolveMessage(line.key, {
          actor: line.actor,
          time: formatUploadedAt(line.timestamp, now(), getLocale()),
        }),
  )

  // Desktop placement. Beside the explore panel the offsets are `MoreMenu`'s, which are that
  // panel's own right edge (`left-27` plus `max-w-sm` / `lg:max-w-md`) plus a gap: the two read
  // as a pair, and Modal's backdrop is z-40, under the panel's z-50, so the record stays lit
  // beside its own history. Standalone, the right-hand aside the topo viewer and the topo
  // editor's sheets use; a trigger-anchored popover (what MoreMenu falls back to there) caps
  // itself at the gap between the trigger and the viewport, and this trigger is page-bottom.
  const panelClass = $derived(
    beside
      ? 'fixed inset-0 left-[31.25rem] z-60 flex items-start py-2 lg:left-[35.25rem]'
      : 'fixed inset-y-0 right-0 z-60',
  )
  const contentClass = $derived(beside ? 'h-full w-80' : 'h-full w-96 rounded-none border-y-0 border-r-0 lg:w-105')

  // A sheet holding one entity's log has to close when the page stops being about that entity.
  // The explore sheets and the route page both re-target in place (prev/next siblings), so
  // without this the log would either survive onto the next record or, since the row unmounts
  // while the new query loads, close and re-animate itself open showing somebody else's history.
  $effect(() => {
    void scopeKey
    open = false
  })
</script>

{#if label != null && line != null}
  <!-- No `nested`: that raises a sheet over another `$lib` Modal sheet, and the explore sheet is
       not one. `backdrop` alone already clears it, which is how MoreMenu opens from these pages. -->
  <Modal backdrop {contentClass} bind:open panel {panelClass} snapPoints={[0.9]} title={m.feed_title()}>
    {#snippet trigger()}
      <Row title={label} onclick={() => (open = true)} {rightContent}>
        <!-- `loading` rather than the "?" initials: an unknown actor is one the sentence has
             already dropped, so the avatar must not assert a person either. -->
        <Avatar loading={line.actor === ''} name={line.actor} size={40} solid />
      </Row>
    {/snippet}

    <!-- Mounted with the sheet, so the 50-row window and its hydration start on the tap. -->
    {#if open}
      <ActivityLog emptyLabel={label} {lightbox} {scope} />
    {/if}
  </Modal>
{/if}

{#snippet rightContent()}
  <Icon name="history" size={17} class="text-surface-500 shrink-0" />
{/snippet}
