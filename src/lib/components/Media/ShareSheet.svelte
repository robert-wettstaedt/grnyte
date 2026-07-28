<!--
  Share surface for a single media file. Collapses "share" and "make public" into
  one flow: an editor flips the public-link switch (which persists visibility),
  everyone gets the copyable public URL once the media is public. The link is the
  auth-agnostic `/f/<id>` address so it survives the day that route lands; until
  then it is still the thing we hand out.
-->
<script lang="ts">
  import { browser } from '$app/environment'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { setFileVisibility } from '$lib/entities/file/files.remote'
  import { m } from '$lib/paraglide/messages'
  import { createCopyButton } from '$lib/state/clipboard.svelte'
  import { notifyError } from '$lib/state/toast'
  import { Switch } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    /** Whether the viewer may change visibility (region EDIT / own ascent). */
    canEdit: boolean
    file: MediaFile
    /** Notified after a visibility toggle persists; lets a host without a reactive
     *  `file` (e.g. the server-loaded /f/ page) update its own copy. */
    onVisibilityChange?: (visibility: 'private' | 'public') => void
    /** Bindable so the host can pause its own shortcuts while the sheet is up. */
    open?: boolean
    /** Text shared alongside the link (e.g. the route name). */
    shareText: string
  }

  let { canEdit, file, onVisibilityChange, open = $bindable(false), shareText }: Props = $props()

  let saving = $state(false)

  // Private unless EXPLICITLY 'public' (see MediaFile.visibility). Reads straight
  // off the synced row so the switch reflects the persisted state.
  const isPublic = $derived(file.visibility === 'public')
  const isVideo = $derived(file.bunnyStreamFk != null)

  const shareUrl = $derived(page.url.origin + resolve('/f/[id]', { id: file.id }))
  const shareData = $derived<ShareData>({ text: shareText, title: PUBLIC_APPLICATION_NAME, url: shareUrl })
  // Web Share is mostly mobile; elsewhere we fall back to copying the link.
  const canShare = $derived(browser && navigator.canShare?.(shareData) === true)

  const clip = createCopyButton()

  // Rejects when the user dismisses the share sheet; nothing to recover from.
  const share = () => void navigator.share(shareData).catch(() => {})

  const setVisibility = async (next: boolean) => {
    if (saving) return
    saving = true
    try {
      const visibility = next ? 'public' : 'private'
      await setFileVisibility({ fileId: file.id, visibility })
      onVisibilityChange?.(visibility)
    } catch {
      notifyError()
    } finally {
      saving = false
    }
  }
</script>

<Modal
  backdrop
  bind:open
  panel={false}
  contentClass="w-80"
  title={isVideo ? m.share_shareVideo() : m.share_sharePhoto()}
>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'btn preset-glass-neutral btn-lg relative h-12 w-12 px-0']}
      aria-label={m.share_share()}
      title={isPublic ? m.share_statusPublic() : m.share_statusPrivate()}
      onclick={() => (open = !open)}
    >
      <Icon name="share" size={19} />
      <!-- At-a-glance visibility: a green dot marks a public (shared) file, a muted dot a
           private one, so the state is legible without opening the sheet. -->
      <span
        class={[
          'absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-black/40',
          isPublic ? 'bg-success-500' : 'bg-surface-400',
        ]}
      ></span>
    </button>
  {/snippet}

  <div class="space-y-4">
    {#if canEdit}
      <Switch
        checked={isPublic}
        disabled={saving}
        class="border-surface-200-800 flex w-full items-center justify-between gap-3 border-y py-3"
        onCheckedChange={(details) => setVisibility(details.checked)}
      >
        <Switch.Label class="min-w-0">
          <span class="block font-semibold">{m.share_publicLink()}</span>
          <span class="text-surface-600-400 block text-sm leading-relaxed">
            {isPublic ? m.share_statusPublic() : m.share_turnOn()}
          </span>
        </Switch.Label>
        <Switch.Control class="flex-none"><Switch.Thumb /></Switch.Control>
        <Switch.HiddenInput />
      </Switch>
    {:else}
      <div class="flex items-start gap-3">
        <Icon name={isPublic ? 'link' : 'lock'} size={20} class="mt-0.5 shrink-0" />
        <p class="text-surface-600-400 text-sm">{isPublic ? m.share_statusPublic() : m.share_statusPrivate()}</p>
      </div>
    {/if}

    {#if isPublic}
      <div class="space-y-2">
        <div class="border-surface-200-800 bg-surface-100-900 truncate rounded border px-3 py-2 text-sm">
          {shareUrl}
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn preset-filled flex-1 gap-2" onclick={() => clip.copy(shareUrl)}>
            <Icon name={clip.copied ? 'check' : 'copy'} size={18} />
            <span aria-live="polite">{clip.copied ? m.share_linkCopied() : m.share_copyLink()}</span>
          </button>
          {#if canShare}
            <button type="button" class="btn preset-tonal" aria-label={m.share_share()} onclick={share}>
              <Icon name="share" size={18} />
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</Modal>
