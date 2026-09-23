<!--
  Single-file share page (`/f/<id>`). Reachable by anonymous visitors, so it renders
  standalone (no app shell, no Zero) from a plain server load, but reuses the real in-app
  media viewer: MediaStage (our video player, thumbnail-first images, pinch-zoom, the
  ascent/route detail bottom-sheet) fed by a static global-state fixture. The only extras
  are the branding and the signed-in share/delete toolbar (as in MediaViewer).
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import ConfirmDialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MediaStage from '$lib/components/Media/MediaStage.svelte'
  import ShareSheet from '$lib/components/Media/ShareSheet.svelte'
  import { MEDIA_TOOL } from '$lib/components/Media/toolbar'
  import { deleteFile } from '$lib/entities/file/files.remote'
  import type { FileParent } from '$lib/entities/file/mapper'
  import { entityHref, type EntityKind } from '$lib/entities/href'
  import { setUnitPreference } from '$lib/i18n/units.svelte'
  import { imageSrc } from '$lib/images/derivatives'
  import { m } from '$lib/paraglide/messages'
  import { provideGlobalState, staticGlobalState } from '$lib/state/global.svelte'
  import { exit } from '$lib/state/navigation.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import { untrack } from 'svelte'

  const { data } = $props()

  // The reference data MediaStage/Markdown read via getGlobalState(), served over the load
  // instead of Zero. `user` is undefined for anon, which also gates MediaStage's links.
  // Built once from the initial load data (it never changes for a page); untrack says so.
  provideGlobalState(
    untrack(() => staticGlobalState({ grades: data.grades, gradingScale: data.gradingScale, user: data.user })),
  )

  // This route is outside the (app) layout, so it feeds the signed-in viewer's unit preference to
  // the formatters MediaStage uses (temperature). Anon visitors (no user) fall back to the locale.
  $effect(() => {
    setUnitPreference(data.user?.userSettings?.unitSystem ?? null)
  })

  const controls = $derived(data.controls)

  // ShareSheet toggles visibility; the row isn't Zero-reactive here, so mirror it locally
  // (and hand MediaStage/ShareSheet the same file).
  let visibilityOverride = $state<'private' | 'public'>()
  const file = $derived(visibilityOverride == null ? data.file : { ...data.file, visibility: visibilityOverride })

  // Already a display name: the loader runs it through `toDisplayName`.
  const title = $derived(data.file.route == null ? m.files_sharedFile() : data.file.route.name)
  // No image for a video, deliberately. The host's poster cannot serve as one: the pull zone has
  // hotlink protection, so a request carrying no Referer (which is every unfurl crawler) gets 403,
  // whether or not the poster exists. `ready` would not have been a safe test anyway, since webhook
  // status 4 makes a video playable while its derivatives are still being generated. Serving the
  // site default beats advertising a URL that answers 403 and gets cached that way.
  const ogImage = $derived(
    data.file.bunnyStreamFk == null ? `${page.url.origin}${imageSrc(data.file.path, 1024)}` : undefined,
  )

  let shareOpen = $state(false)

  // Where to land after a delete: the file's owning entity (its share page is now a 404),
  // falling back home if there somehow is no parent.
  // A file's parent names its type in the singular; `entityHref` keys on the plural route segment.
  // Keyed on `FileParent['type']`, so a parent kind added to the mapper must answer here too.
  const PARENT_KIND: Record<FileParent['type'], EntityKind> = {
    area: 'areas',
    ascent: 'ascents',
    block: 'blocks',
    route: 'routes',
  }

  const parentHref = (parent: FileParent | null | undefined) => {
    // The lookup is total to TypeScript but not at runtime: `parent` comes from the SERVER load, so
    // a newer deploy can name a kind this bundle has never heard of. Home, never `undefined`.
    const kind = parent == null ? undefined : (PARENT_KIND[parent.type] as EntityKind | undefined)
    return kind == null || parent == null ? resolve('/') : entityHref(kind, parent.id)
  }

  const onDelete = async () => {
    try {
      await deleteFile({ id: data.file.id })
      toaster.create({ title: m.media_deleted(), type: 'info' })
      await exit(parentHref(data.controls?.parent))
    } catch (cause) {
      notifyError(cause)
    }
  }
</script>

<svelte:head>
  <title>{title} - {PUBLIC_APPLICATION_NAME}</title>
  <meta name="description" content={title} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={PUBLIC_APPLICATION_NAME} />
  {#if ogImage != null}
    <meta property="og:image" content={ogImage} />
  {/if}
  <meta property="og:url" content={page.url.toString()} />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="fixed inset-0 bg-black text-white">
  <MediaStage {file} />

  <!-- Home / branding, top-left. Sized/typed like the landing header. -->
  <a
    href={resolve('/')}
    class="absolute top-3 left-3 z-20 flex items-center gap-2.5 rounded-lg bg-black/30 px-2.5 py-1.5 no-underline backdrop-blur-sm hover:bg-black/50"
  >
    <img src={Logo} alt="" class="block h-7.5 w-7.5 rounded-lg" />
    <strong class="[font-family:var(--heading-font-family)] text-[19px] font-bold tracking-tight">
      {PUBLIC_APPLICATION_NAME}
    </strong>
  </a>

  <!-- Share / delete, top-right, signed-in only (as in the media viewer's toolbar). -->
  {#if controls != null}
    <div class="absolute top-3 right-3 z-20 flex items-center gap-2">
      <ShareSheet
        {file}
        canEdit={controls.canEdit}
        shareText={controls.shareText}
        bind:open={shareOpen}
        onVisibilityChange={(next) => (visibilityOverride = next)}
      />

      {#if controls.canDelete}
        <ConfirmDialog title={m.media_delete()} saveText={m.common_delete()} onsave={onDelete}>
          {#snippet trigger(props)}
            <button {...props} type="button" class={[props.class, MEDIA_TOOL]} aria-label={m.common_delete()}>
              <Icon name="trash" size={20} />
            </button>
          {/snippet}
          {#snippet content()}
            {m.media_deleteConfirm()}
          {/snippet}
        </ConfirmDialog>
      {/if}
    </div>
  {/if}
</div>
