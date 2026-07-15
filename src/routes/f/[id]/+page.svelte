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
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MediaStage from '$lib/components/Media/MediaStage.svelte'
  import ShareSheet from '$lib/components/Media/ShareSheet.svelte'
  import { m } from '$lib/paraglide/messages'
  import { provideGlobalState, staticGlobalState } from '$lib/state/global.svelte'
  import { toaster } from '$lib/state/toast'
  import { bunnyThumbnail } from '$lib/videos/bunny'
  import { untrack } from 'svelte'

  const { data } = $props()

  // The reference data MediaStage/Markdown read via getGlobalState(), served over the load
  // instead of Zero. `user` is undefined for anon, which also gates MediaStage's links.
  // Built once from the initial load data (it never changes for a page); untrack says so.
  provideGlobalState(
    untrack(() => staticGlobalState({ grades: data.grades, gradingScale: data.gradingScale, user: data.user })),
  )

  const controls = $derived(data.controls)

  // ShareSheet toggles visibility; the row isn't Zero-reactive here, so mirror it locally
  // (and hand MediaStage/ShareSheet the same file).
  let visibilityOverride = $state<'public' | 'private'>()
  const file = $derived(visibilityOverride == null ? data.file : { ...data.file, visibility: visibilityOverride })

  const title = $derived(
    data.file.route == null
      ? m.files_sharedFile()
      : data.file.route.name.length === 0
        ? m.common_unnamed()
        : data.file.route.name,
  )
  const ogImage = $derived(
    data.file.bunnyStreamFk != null
      ? bunnyThumbnail(data.file.bunnyStreamFk)
      : `${page.url.origin}/image/${data.file.path.replace(/^\/+/, '')}?w=1024`,
  )

  let shareOpen = $state(false)

  const btn = 'btn preset-glass-neutral btn-lg h-12 w-12 shrink-0 px-0'
</script>

<svelte:head>
  <title>{title} - {PUBLIC_APPLICATION_NAME}</title>
  <meta name="description" content={title} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={PUBLIC_APPLICATION_NAME} />
  <meta property="og:image" content={ogImage} />
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
        <button
          type="button"
          class={btn}
          aria-label={m.common_delete()}
          onclick={() => toaster.create({ type: 'info', title: m.common_comingSoon(), duration: 2500 })}
        >
          <Icon name="trash" size={20} />
        </button>
      {/if}
    </div>
  {/if}
</div>
