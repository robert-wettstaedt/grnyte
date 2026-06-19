<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Editor } from '@tiptap/core'
  import { Markdown } from '@tiptap/markdown'
  import StarterKit from '@tiptap/starter-kit'
  import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
  import type { Attachment } from 'svelte/attachments'
  import type { HTMLAttributes } from 'svelte/elements'
  import LinkModal from './LinkModal.svelte'
  import ReferenceList from './ReferenceList.svelte'
  import { createReferenceExtension, REFERENCE_NODE_NAME, type ReferenceItem } from './lib/reference-node'
  import { referenceSearch, type ReferenceCandidate } from './lib/reference-search.svelte'

  // Extends HTMLAttributes so the props from a remote form field
  // (`{...field.as('text')}` → name/aria-invalid; wrapper → id/aria-describedby/
  // aria-errormessage) spread straight onto the editable region.
  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Markdown string — bindable, the editor's single source of truth. */
    value?: string | number
    /** Placeholder shown while empty. */
    placeholder?: string
    /** Region whose members may be `@`-mentioned (enables the People group). */
    regionFk?: number
    /** Form field name — when set, the markdown is submitted via a hidden input. */
    name?: string
    /** Swallowed: `field.as('text')` ships it, but we seed from `value`. */
    defaultValue?: string | number
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let { value = $bindable(''), placeholder, regionFk, name, defaultValue: _d, ...rest }: Props = $props()

  // Captured once: the editor initialises from this, then syncs outward. (Fresh
  // mounts with stored markdown rehydrate `!type:id!` tokens into chips here.)
  const initialValue = value

  let editorState = $state<{ editor: Editor | null }>({ editor: null })
  const isEmpty = $derived(String(value).trim().length === 0)

  // --- `@` reference picker ---------------------------------------------------
  interface PickerState {
    open: boolean
    query: string
    index: number
    command: ((item: ReferenceItem) => void) | null
  }
  let picker = $state<PickerState>({ open: false, query: '', index: 0, command: null })

  const search = referenceSearch({ query: () => picker.query, regionFk: () => regionFk, open: () => picker.open })

  const selectItem = (item: ReferenceCandidate) => {
    picker.command?.({ type: item.type, id: item.id, label: item.label })
    picker.open = false
  }

  const onPickerKeyDown = (event: KeyboardEvent): boolean => {
    if (!picker.open) {
      return false
    }
    const count = search.flat.length

    switch (event.key) {
      case 'ArrowDown':
        picker.index = count === 0 ? 0 : (picker.index + 1) % count
        return true
      case 'ArrowUp':
        picker.index = count === 0 ? 0 : (picker.index - 1 + count) % count
        return true
      case 'Enter': {
        const item = search.flat[picker.index]
        if (item != null) {
          selectItem(item)
        }
        return true
      }
      case 'Escape':
        picker.open = false
        return true
      default:
        return false
    }
  }

  const suggestion: Omit<SuggestionOptions<ReferenceItem, ReferenceItem>, 'editor'> = {
    char: '@',
    // The candidate list is reactive (`referenceSearch`); the suggestion plugin
    // only drives the trigger, query, range and keyboard lifecycle.
    items: () => [],
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: REFERENCE_NODE_NAME, attrs: { type: props.type, id: String(props.id), label: props.label } },
          { type: 'text', text: ' ' },
        ])
        .run()
    },
    render: () => ({
      onStart: (props: SuggestionProps<ReferenceItem, ReferenceItem>) => {
        picker = { open: true, query: props.query, index: 0, command: props.command }
      },
      onUpdate: (props: SuggestionProps<ReferenceItem, ReferenceItem>) => {
        picker = { open: true, query: props.query, index: 0, command: props.command }
      },
      onKeyDown: ({ event }) => onPickerKeyDown(event),
      onExit: () => {
        picker.open = false
      },
    }),
  }

  const referenceExtension = createReferenceExtension({
    suggestion,
    resolveLabel: (type, id) => search.resolveLabel(type, id),
  })

  // --- Editor lifecycle -------------------------------------------------------
  const mountEditor: Attachment<HTMLElement> = (node) => {
    const editor = new Editor({
      element: node,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          code: false,
          codeBlock: false,
          heading: false,
          horizontalRule: false,
          orderedList: false,
          strike: false,
          underline: false,
          link: { openOnClick: false },
        }),
        Markdown,
        referenceExtension,
      ],
      content: String(initialValue),
      contentType: 'markdown',
      onTransaction: ({ editor }) => {
        editorState = { editor }
      },
      onUpdate: ({ editor }) => {
        value = editor.getMarkdown()
      },
    })
    editorState = { editor }

    return () => editor.destroy()
  }

  const isActive = (name: string, attrs?: Record<string, unknown>) => editorState.editor?.isActive(name, attrs) ?? false
  const chain = () => editorState.editor?.chain().focus()

  const canUndo = $derived(editorState.editor?.can().undo() ?? false)
  const canRedo = $derived(editorState.editor?.can().redo() ?? false)

  // Insert `@` so the suggestion engine opens; prepend a space when the caret
  // sits right after a non-space character (the trigger only fires at a boundary).
  const triggerMention = () => {
    const editor = editorState.editor
    if (editor == null) {
      return
    }
    const { from } = editor.state.selection
    const charBefore = from > 0 ? editor.state.doc.textBetween(from - 1, from, undefined, ' ') : ''
    const prefix = charBefore !== '' && !/\s/.test(charBefore) ? ' @' : '@'
    editor.chain().focus().insertContent(prefix).run()
  }

  // --- Link modal -------------------------------------------------------------
  // Read on demand when the modal opens, so the form seeds from whatever is
  // selected at that moment.
  const getLinkSelection = () => {
    const editor = editorState.editor
    if (editor == null) {
      return { text: '', href: '' }
    }
    const { from, to } = editor.state.selection
    return {
      text: editor.state.doc.textBetween(from, to, ' '),
      href: (editor.getAttributes('link').href as string | undefined) ?? '',
    }
  }

  const applyLink = ({ text, href }: { text: string; href: string }) => {
    const editor = editorState.editor
    if (editor == null) {
      return
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: text.length > 0 ? text : href, marks: [{ type: 'link', attrs: { href } }] })
      .run()
  }
</script>

<div class="border-surface-200-800 bg-surface-100-900 overflow-hidden rounded-2xl border">
  <!-- Toolbar -->
  <div class="border-surface-200-800 flex items-center gap-1 border-b px-2 py-1.5">
    {#snippet tool(icon: 'bold' | 'italic' | 'list' | 'at-sign', label: string, active: boolean, onclick: () => void)}
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        class="btn-icon hover:preset-tonal {active ? 'preset-filled-primary-500' : ''}"
        {onclick}
      >
        <Icon name={icon} size={18} strokeWidth={2.1} />
      </button>
    {/snippet}

    {#snippet action(icon: 'undo' | 'redo', label: string, disabled: boolean, onclick: () => void)}
      <button
        type="button"
        aria-label={label}
        {disabled}
        class="btn-icon hover:preset-tonal disabled:pointer-events-none disabled:opacity-40"
        {onclick}
      >
        <Icon name={icon} size={18} strokeWidth={2.1} />
      </button>
    {/snippet}

    {@render action('undo', m.editor_undo(), !canUndo, () => chain()?.undo().run())}
    {@render action('redo', m.editor_redo(), !canRedo, () => chain()?.redo().run())}

    <span class="bg-surface-300-700 mx-1 h-5 w-px"></span>

    {@render tool('bold', m.editor_bold(), isActive('bold'), () => chain()?.toggleBold().run())}
    {@render tool('italic', m.editor_italic(), isActive('italic'), () => chain()?.toggleItalic().run())}
    {@render tool('list', m.editor_bulletList(), isActive('bulletList'), () => chain()?.toggleBulletList().run())}
    <LinkModal active={isActive('link')} getInitial={getLinkSelection} onsubmit={applyLink} />

    <span class="bg-surface-300-700 mx-1 h-5 w-px"></span>

    {@render tool('at-sign', m.editor_mention(), false, triggerMention)}
  </div>

  <!-- Editable area -->
  <div class="relative">
    <div class="editor-host" {...rest} {@attach mountEditor}></div>
    {#if isEmpty && placeholder}
      <span class="text-surface-500 pointer-events-none absolute top-3 left-3 text-sm">{placeholder}</span>
    {/if}
  </div>

  <!-- Submitted value: the form reads FormData from the DOM, so the markdown
       needs a real named control. -->
  {#if name}
    <input type="hidden" {name} value={String(value)} />
  {/if}

  <!-- In-flow reference picker (per design — not a caret-floating popover) -->
  {#if picker.open}
    <div class="border-surface-200-800 max-h-64 overflow-y-auto border-t">
      <ReferenceList groups={search.groups} activeIndex={picker.index} onselect={selectItem} />
    </div>
  {/if}
</div>

<style>
  .editor-host :global(.ProseMirror) {
    min-height: 8rem;
    padding: 0.75rem;
    outline: none;
    font-size: 0.9rem;
    line-height: 1.55;
  }

  .editor-host :global(.ProseMirror > * + *) {
    margin-top: 0.6em;
  }

  .editor-host :global(.ProseMirror ul) {
    padding-left: 1.25rem;
    list-style: disc;
  }

  .editor-host :global(.ProseMirror a) {
    color: var(--color-primary-600);
    text-decoration: underline;
  }

  :global(.dark) .editor-host :global(.ProseMirror a) {
    color: var(--color-primary-400);
  }

  /* Typed reference chip (rendered by the reference node). */
  .editor-host :global(.reference-chip) {
    background: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
    color: var(--color-primary-700);
    padding: 0.05em 0.4em;
    border-radius: 0.375rem;
    font-weight: 600;
    white-space: nowrap;
  }

  :global(.dark) .editor-host :global(.reference-chip) {
    color: var(--color-primary-300);
  }
</style>
