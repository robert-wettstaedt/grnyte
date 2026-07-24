<script lang="ts">
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import MediaThumbnail from '$lib/components/Media/MediaThumbnail.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import { formatDay } from '$lib/i18n/relativeTime'
  import { formatConditions } from '$lib/i18n/units.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { openMedia } from '$lib/state/navigation.svelte'
  import { now } from '$lib/state/now.svelte'
  import { toaster } from '$lib/state/toast'
  import { slide } from 'svelte/transition'
  import { deleteAscent } from './ascents.remote'
  import AscentType from './AscentType.svelte'
  import type { RouteAscent } from './dto'
  import { canEditAscent } from './permissions'

  // One ascent in a route's ascent list. Tapping the row toggles the expanded
  // details (full note, conditions, the climber's edit/delete actions); media thumbs
  // always show and open the page's viewer directly; the avatar and name link to the
  // climber's profile. The hosting page owns the viewer (MediaGrid or MediaLightbox).
  interface Props {
    ascent: RouteAscent
    /** Location breadcrumb (e.g. "Area · Block"), shown above the route name in logbook mode. */
    crumbs?: string | string[]
    /** Expand the details (a deep-linked row opens pre-expanded); the row still toggles freely. */
    expanded?: boolean
    /** Primary-tinted framing for the signed-in climber's own (or a deep-linked) row. */
    highlight?: boolean
    /** DOM id, so a deep link (?ascent=) can scroll the row into view. */
    id?: string
    /** Logbook mode (the profile's session list): show the route as the row's label
     *  and drop the author avatar — the author is the profile itself. */
    route?: { href: string; name: string }
    /** The route's name: the delete confirmation text. */
    routeName?: string
  }

  let { ascent, crumbs, expanded = $bindable(false), highlight = false, id, route, routeName = '' }: Props = $props()

  const global = getGlobalState()

  const crumbText = $derived(Array.isArray(crumbs) ? crumbs.join(' · ') : crumbs)

  const canEdit = $derived(canEditAscent(global.userRegions, global.user?.id, ascent))
  // Empty until the author row syncs in (Zero loads the relation lazily): show a
  // skeleton for the avatar and name rather than a blank circle and empty link.
  const authorLoading = $derived(ascent.authorName === '')
  const hasNotes = $derived(ascent.notes.trim() !== '')
  const conditions = $derived(formatConditions(ascent.temperature, ascent.humidity))
  const editHref = $derived(resolve('/(app)/ascents/[id]/edit', { id: String(ascent.id) }))
  const userHref = $derived(resolve('/(app)/users/[id]', { id: String(ascent.createdBy) }))

  // Deleting takes the attached media with it, so it confirms instead of offering
  // undo. No navigation needed: the removal syncs and the row drops out of the list.
  const onDelete = async () => {
    await deleteAscent({ id: ascent.id })
    toaster.create({ title: m.ascents_deleted(), type: 'info' })
  }

  const MAX_THUMBS = 3

  // The overflow chip jumps into the viewer at the first hidden file, same URL
  // mechanism as MediaThumbnail (the ?media param the page's viewer host reads).
  const openOverflow = () => openMedia(ascent.files[MAX_THUMBS].id)
</script>

<article
  {id}
  class={[
    'rounded-2xl border',
    highlight ? 'border-primary-500/40 bg-primary-500/5' : 'border-surface-200-800 bg-surface-50-950',
  ]}
>
  <div class="relative">
    <!-- Stretched toggle behind the content: the whole row expands/collapses, while
         the climber links float above it (a link can't nest inside a button). -->
    <button
      class="absolute inset-0 w-full"
      onclick={() => (expanded = !expanded)}
      type="button"
      aria-expanded={expanded}
      aria-label={m.common_details()}
    ></button>

    <div class="pointer-events-none relative flex flex-col gap-1.5 px-3.5 py-3">
      <!-- The avatar pairs with the text block only; the media strip lives below so
           its size change on expand can't re-center (jump) the avatar. -->
      <div class="flex items-center gap-3">
        {#if route == null}
          <!-- Same destination as the name link; hidden from the tab order and readers. -->
          <a class="pointer-events-auto flex-none" href={userHref} aria-hidden="true" tabindex="-1">
            <Avatar name={ascent.authorName} size={38} solid loading={authorLoading} />
          </a>
        {/if}

        <span class="flex min-w-0 flex-1 flex-col gap-1.5">
          {#if crumbText}
            <span class="text-surface-500 truncate text-[11px] font-semibold tracking-wide">{crumbText}</span>
          {/if}
          <span class="flex items-center gap-2">
            {#if route != null}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers resolve() the href -->
              <a class="pointer-events-auto truncate text-sm font-semibold hover:underline" href={route.href}>
                {route.name}
              </a>
            {:else if authorLoading}
              <span class="bg-surface-200-800 h-3.5 w-24 animate-pulse rounded"></span>
            {:else}
              <a class="pointer-events-auto truncate text-sm font-semibold hover:underline" href={userHref}>
                {ascent.authorName}
              </a>
            {/if}
            <AscentType status={ascent.type} />
            <span class="flex-1"></span>
            <!-- In logbook mode the session's day header already dates the row. -->
            {#if route == null && ascent.dateTime != null}
              <span class="text-surface-600-400 flex-none text-xs font-semibold">
                {formatDay(ascent.dateTime, now(), getLocale())}
              </span>
            {/if}
          </span>

          <!-- Grade + rating always render (the "—" pill and empty stars nudge climbers
               to log an opinion), matching the route detail header. -->
          <span class="flex min-w-0 items-center gap-2">
            <RouteGrade
              band={getGradeBand(ascent.gradeFk)}
              grade={gradeLabel(global.grades, global.gradingScale, ascent.gradeFk)}
            />
            <RouteRating rating={ascent.rating} />
            {#if hasNotes && !expanded}
              <Markdown className="short" disableLinks encloseReferences="strong" markdown={ascent.notes} />
            {/if}
          </span>
        </span>
      </div>

      <!-- Beta strip: always visible so the list can be scanned for who has media.
           Thumbs float above the row toggle and jump straight into the viewer;
           expanding the row grows them and shows the full set. Indented past the
           avatar column so it aligns with the text block. -->
      {#if ascent.files.length > 0}
        <!-- Indented past the avatar column so it aligns with the text block; no avatar in logbook mode, so no indent. -->
        <span class="pointer-events-auto flex items-center gap-1.5 overflow-x-auto" class:ml-12.5={route == null}>
          {#each expanded ? ascent.files : ascent.files.slice(0, MAX_THUMBS) as file (file.id)}
            <MediaThumbnail {file} class={expanded ? 'h-24' : 'h-10'} />
          {/each}
          {#if !expanded && ascent.files.length > MAX_THUMBS}
            <button
              type="button"
              class="bg-surface-200-800 text-surface-600-400 flex h-10 w-10 flex-none items-center justify-center rounded-lg text-xs font-bold"
              aria-label={m.media_openImage()}
              onclick={openOverflow}
            >
              +{ascent.files.length - MAX_THUMBS}
            </button>
          {/if}
        </span>
      {/if}
    </div>
  </div>

  {#if expanded}
    <div class="flex flex-col gap-2.5 px-3.5 pb-3" transition:slide={{ duration: 150 }}>
      {#if hasNotes}
        <div class="text-sm">
          <Markdown markdown={ascent.notes} />
        </div>
      {/if}

      {#if conditions !== '' || canEdit}
        <div class="flex items-center gap-2">
          {#if conditions !== ''}
            <span
              class="border-surface-200-800 bg-surface-100-900 text-surface-600-400 inline-flex h-6.25 items-center rounded-full border px-2.5 font-mono text-[11px] font-bold"
            >
              {conditions}
            </span>
          {/if}
          <span class="flex-1"></span>
          {#if canEdit}
            <a class="btn btn-sm preset-tonal-surface" href={editHref}>
              <Icon name="edit" size={13} />
              {m.common_edit()}
            </a>
            <Dialog title={m.ascents_delete()} saveText={m.ascents_delete()} onsave={onDelete}>
              {#snippet trigger(props)}
                <button {...props} type="button" class={[props.class, 'btn btn-sm preset-tonal-error']}>
                  <Icon name="trash" size={13} />
                  {m.common_delete()}
                </button>
              {/snippet}
              {#snippet content()}
                {m.ascents_deleteConfirm({ name: routeName })}
              {/snippet}
            </Dialog>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</article>
