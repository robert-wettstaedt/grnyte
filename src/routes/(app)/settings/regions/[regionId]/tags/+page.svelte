<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { canEditRegion } from '$lib/entities/region/permissions'
  import { addRegionTag, regionTagUsage, removeRegionTag, renameRegionTag } from '$lib/entities/region/regions.remote'
  import { MAX_TAGS, regionTags, tagNameSchema } from '$lib/entities/region/tagVocabulary'
  import { resolveIssueMessage } from '$lib/forms/issue'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import SettingSection from '../../../SettingSection.svelte'
  import TagRow from './TagRow.svelte'

  const global = getGlobalState()

  const regionId = $derived(Number(page.params.regionId))

  // Region settings are admin-only, and the link into here is too, so this only catches somebody
  // typing the URL. The server rejects them either way. This is so they find out before typing.
  const isAdmin = $derived(canEditRegion(global.userRegions, regionId))

  // Derived, not a snapshot: the vocabulary is whatever the synced membership says right now. A
  // snapshot taken once at init and submitted back as a whole list would delete a tag another
  // admin added while the page sat open, junction rows and all, on a save that touched nothing.
  const tags = $derived(regionTags(global.userRegions, regionId))

  // One grouped count for the whole screen. Every mutation invalidates it, and until it lands each
  // row's remove control stays disabled rather than offering to destroy an unknown quantity.
  const usage = $derived(regionTagUsage({ regionFk: regionId }))
  const refreshUsage = () => regionTagUsage({ regionFk: regionId }).refresh()

  /** `undefined` until the counts arrive. An absent key afterwards is a real zero. */
  const routeCount = (tag: string) => (usage.current == null ? undefined : (usage.current[tag] ?? 0))

  let adding = $state(false)
  let draft = $state('')

  const trimmed = $derived(draft.trim())
  const parsed = $derived(tagNameSchema.safeParse(draft))
  const full = $derived(tags.length >= MAX_TAGS)

  const addIssue = $derived.by(() => {
    if (trimmed === '') return undefined
    if (tags.includes(trimmed)) return m.region_tagDuplicate()
    if (full) return m.region_tagsTooMany({ count: MAX_TAGS })
    return parsed.success ? undefined : resolveIssueMessage(parsed.error.issues[0].message)
  })

  const canAdd = $derived(parsed.success && !tags.includes(trimmed) && !full)

  const goBack = () => back(resolve('/(app)/settings/regions/[regionId]', { regionId: String(regionId) }))

  const onAdd = async () => {
    if (!canAdd || adding) return

    const name = trimmed
    adding = true

    try {
      await addRegionTag({ name, regionFk: regionId })
      // Cleared but never blurred: adding several tags in a row is one field and one Return each.
      // Only if the field still holds what was sent, so a fast typist does not lose the next word.
      if (draft.trim() === name) draft = ''
      toaster.create({ title: m.region_tagAdded({ name }), type: 'success' })
    } catch (cause) {
      notifyError(cause)
    } finally {
      adding = false
    }
  }

  const onRename = async (from: string, to: string) => {
    try {
      await renameRegionTag({ from, regionFk: regionId, to })
      await refreshUsage()
      toaster.create({ title: m.region_tagRenamed({ from, to }), type: 'success' })
    } catch (cause) {
      notifyError(cause)
    }
  }

  // No undo, unlike removing a member: putting the junction rows back would collide on
  // `routes_to_tags`' primary key after any later rename onto the freed name. The count in the
  // confirm is the safeguard instead, which is the better place for it anyway.
  const onRemove = async (name: string) => {
    try {
      await removeRegionTag({ name, regionFk: regionId })
      await refreshUsage()
      toaster.create({ title: m.region_tagRemoved({ name }), type: 'info' })
    } catch (cause) {
      notifyError(cause)
    }
  }
</script>

<svelte:head>
  <title>{m.region_tags()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if !isAdmin}
  <ErrorState type="notfound" title={m.region_notFound()} />
{:else}
  <PageHeader onback={goBack} title={m.region_tags()} />

  <div class="container mx-auto max-w-2xl px-4 py-8 pb-24 md:pb-8">
    <SettingSection title={m.region_tags()}>
      {#snippet aside()}
        <span class="text-surface-600-400 text-xs">{m.region_tagsCount({ count: tags.length, max: MAX_TAGS })}</span>
      {/snippet}

      <p class="text-surface-600-400 text-sm">{m.region_tagsHint()}</p>

      <!-- Above the list rather than below it: at the 30-tag cap a trailing field sits a screen and
           a half down and under the keyboard. Same joined input-group as the invite field on the
           parent screen, so the button reads as the field's action, not a page-level CTA.

           The field is disabled only when the list is full, never while an add is in flight:
           disabling it blurs it, and keeping the caret is the whole reason it is permanent. -->
      <form
        onsubmit={(event) => {
          event.preventDefault()
          void onAdd()
        }}
      >
        <div class="input-group min-h-11 grid-cols-[1fr_auto]">
          <input
            aria-label={m.region_tagAdd()}
            autocapitalize="none"
            autocomplete="off"
            bind:value={draft}
            class="ig-input"
            disabled={full}
            maxlength={30}
            placeholder={m.region_tagName()}
          />
          <button type="submit" class="ig-btn preset-filled-primary-500" disabled={!canAdd || adding}>
            {m.common_add()}
          </button>
        </div>
      </form>

      {#if addIssue != null}
        <p class="text-error-600-400 text-sm" role="alert">{addIssue}</p>
      {/if}

      {#if tags.length === 0}
        <p class="text-surface-600-400 text-sm">{m.region_tagsEmpty()}</p>
      {:else}
        <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
          {#each tags as tag (tag)}
            <TagRow
              onRemove={() => onRemove(tag)}
              onRename={(to) => onRename(tag, to)}
              siblings={tags}
              {tag}
              usage={routeCount(tag)}
            />
          {/each}
        </div>
      {/if}
    </SettingSection>
  </div>
{/if}
