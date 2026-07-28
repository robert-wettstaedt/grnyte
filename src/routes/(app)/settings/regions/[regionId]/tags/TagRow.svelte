<script lang="ts">
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { tagNameSchema } from '$lib/entities/region/tagVocabulary'
  import { resolveIssueMessage } from '$lib/forms/issue'
  import { m } from '$lib/paraglide/messages'

  // A tag as a settings row: the word, how many routes carry it, chevron, same shape as MemberRow.
  // The row opens the tag's sheet (popover on desktop), where renaming is the primary verb and
  // removing is ruled off underneath it.
  interface Props {
    onRemove: () => void
    onRename: (to: string) => void
    /** The whole vocabulary, to refuse a rename onto a name already taken. */
    siblings: string[]
    /** The stored tag. Everything on the destruction path reads this and never `draft`, so a
     *  half-typed rename can never name what gets deleted. */
    tag: string
    /** How many routes carry it, or `undefined` until the count lands. */
    usage: number | undefined
  }

  const { onRemove, onRename, siblings, tag, usage }: Props = $props()

  let confirming = $state(false)
  // Seeded by the trigger rather than here, so an abandoned edit never carries into the next open.
  let draft = $state('')
  let open = $state(false)

  const trimmed = $derived(draft.trim())
  const parsed = $derived(tagNameSchema.safeParse(draft))
  const taken = $derived(trimmed !== tag && siblings.includes(trimmed))

  // Nothing to say while the field still holds the stored name, or while it is empty and the admin
  // is mid-retype: an error on every cleared field would fire before they have done anything wrong.
  const issue = $derived.by(() => {
    if (trimmed === tag || trimmed === '') return undefined
    if (taken) return m.region_tagDuplicate()
    return parsed.success ? undefined : resolveIssueMessage(parsed.error.issues[0].message)
  })

  const canRename = $derived(parsed.success && trimmed !== tag && !taken)

  const rename = () => {
    if (!canRename) return
    open = false
    onRename(trimmed)
  }
</script>

<!-- panel={false}: a trigger-anchored popover on desktop (this is a page, not the map sheet), a
     bottom sheet on mobile. The mobile branch renders the trigger without wiring, so the click
     handler is ours, and it re-seeds the draft so an abandoned edit never carries into the next
     open. -->
<Modal
  backdrop
  bind:open
  panel={false}
  contentClass="max-h-[var(--available-height)] w-80 overflow-y-auto"
  popoverProps={{ positioning: { placement: 'bottom-end' } }}
  subtitle={usage == null ? undefined : m.routes_routesCount({ count: usage })}
  title={tag}
>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'hover:bg-surface-100-900 flex w-full items-center justify-between gap-4 p-4 text-left']}
      onclick={() => {
        draft = tag
        open = !open
      }}
    >
      <span class="min-w-0 truncate">{tag}</span>

      <span class="flex flex-none items-center gap-2">
        {#if usage != null}
          <span class="text-surface-600-400 text-sm">{m.routes_routesCount({ count: usage })}</span>
        {/if}
        <Icon name="chevron-right" class="text-surface-400-600" />
      </span>
    </button>
  {/snippet}

  <form
    class="space-y-2 px-1 pt-1"
    onsubmit={(event) => {
      event.preventDefault()
      rename()
    }}
  >
    <label class="text-surface-700-300 block text-sm font-semibold" for="tag-{tag}-name">{m.region_tagName()}</label>

    <input
      id="tag-{tag}-name"
      autocapitalize="none"
      autocomplete="off"
      bind:value={draft}
      class="input"
      maxlength={30}
    />

    {#if issue != null}
      <p class="text-error-600-400 text-sm" role="alert">{issue}</p>
    {:else if canRename && usage != null && usage > 0}
      <!-- Said here rather than only in the section hint: this is the moment the admin is deciding,
           and a rename that silently moved 31 routes would be the surprising outcome. -->
      <p class="text-surface-600-400 text-xs">{m.region_tagRenameHint({ count: usage })}</p>
    {/if}

    <button type="submit" class="btn preset-filled-primary-500 w-full" disabled={!canRename}>
      {m.region_tagRename()}
    </button>
  </form>

  <!-- Ruled off: directly under the rename button it reads as a second way to save. Disabled until
       the count lands, so an unknown blast radius is a wait rather than a deletion. -->
  <div class="border-surface-200-800 mt-3 border-t pt-2">
    <MenuRow
      destructive
      disabled={usage == null}
      icon="trash"
      label={m.region_tagRemove()}
      onclick={() => {
        open = false
        confirming = true
      }}
    />
  </div>
</Modal>

<!-- Guarded rather than always mounted: Dialog portals its content into the body on mount, the same
     reason MemberRow guards its leave dialog. -->
{#if confirming}
  <Dialog
    open
    onOpenChange={() => (confirming = false)}
    title={m.region_tagRemove()}
    saveText={m.common_remove()}
    onsave={onRemove}
  >
    {#snippet content()}
      {usage === 0
        ? m.region_tagRemoveUnused({ name: tag })
        : m.region_tagRemoveConfirm({ count: usage ?? 0, name: tag })}
    {/snippet}
  </Dialog>
{/if}
