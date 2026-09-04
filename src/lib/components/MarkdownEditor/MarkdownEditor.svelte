<script lang="ts">
  import EntityList from '$lib/components/EntitySearch/EntityList.svelte'
  import { entitySearch, type EntityCandidate, type EntityItem } from '$lib/components/EntitySearch/search.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { markdownReferences } from '$lib/components/Markdown/lib/references.svelte'
  import { getReferences } from '$lib/components/Markdown/lib/remark-references'
  import { m } from '$lib/paraglide/messages'
  import { Editor } from '@tiptap/core'
  import { Markdown } from '@tiptap/markdown'
  import StarterKit from '@tiptap/starter-kit'
  import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
  import type { Attachment } from 'svelte/attachments'
  import type { HTMLAttributes } from 'svelte/elements'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'
  import { createReferenceExtension, REFERENCE_NODE_NAME } from './lib/reference-node'
  import { submitOnEnter } from './lib/submit-on-enter'
  import LinkModal from './LinkModal.svelte'

  // Extends HTMLAttributes so the props from a remote form field
  // (`{...field.as('text')}` → name/aria-invalid; wrapper → id/aria-describedby/
  // aria-errormessage) spread straight onto the editable region.
  interface Props extends HTMLAttributes<HTMLDivElement> {
    /**
     * Chat shape rather than document shape: one line that grows, and a toolbar that stays out
     * of the way until the box has focus. The full editor is a permanent toolbar taller than most
     * comments, so this is the same editor with its furniture folded away, letting a comment name
     * a route or person like any other text in the app.
     */
    compact?: boolean
    /** Swallowed: `field.as('text')` ships it, but we seed from `value`. */
    defaultValue?: number | string
    /** Form field name: when set, the markdown is submitted via a hidden input. */
    name?: string
    /**
     * Enter sends, and Shift+Enter breaks the line, as every chat box does. Never on a soft
     * keyboard, where Enter IS the line break, and never while the `@` picker is open, where
     * Enter chooses the highlighted person.
     *
     * Not `onsubmit`: this interface extends `HTMLAttributes` so a remote form field can spread
     * onto the editable region, and that name is already the DOM's submit handler there.
     */
    onsend?: () => void
    /** Placeholder shown while empty. */
    placeholder?: string
    /** Region whose members may be `@`-mentioned (enables the People group). */
    regionFk?: number
    /** Markdown string, bindable: the editor's single source of truth. */
    value?: number | string
  }

  let {
    compact = false,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    defaultValue: _d,
    name,
    onsend,
    placeholder,
    regionFk,
    value = $bindable(''),
    ...rest
  }: Props = $props()

  /** Compact only: the toolbar is revealed by focus, so a quiet thread stays quiet. */
  let focused = $state(false)

  /** The reveal is motion, and somebody who asked for less of it gets the toolbar with no slide. */
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  /**
   * Whether the link dialog is up, which counts as the toolbar still being in use.
   *
   * `LinkModal` renders its dialog through a `<Portal>`, so the field the reader is typing a URL
   * into is NOT inside this wrapper: focus leaves, `focused` goes false, and the toolbar folds
   * away underneath the dialog it opened. The toolbar is that dialog's own trigger, so it has
   * to outlive it.
   */
  let linkOpen = $state(false)
  const toolbarShown = $derived(!compact || focused || linkOpen)

  /**
   * And hand focus back to the box when the dialog goes.
   *
   * Skeleton returns focus to the trigger, which by then is a hidden button, so without this the
   * reader is left with focus on nothing, a folded toolbar and a composer that looks inert.
   * Compared against the previous value rather than watched with a cleanup, so it cannot fire
   * while the editor is being torn down.
   */
  let linkWasOpen = false

  $effect(() => {
    if (linkWasOpen && !linkOpen) {
      chain()?.run()
    }

    linkWasOpen = linkOpen
  })

  // Captured once: the editor initialises from this, then syncs outward. (Fresh
  // mounts with stored markdown rehydrate `!type:id!` tokens into chips here.)
  const initialValue = value

  // Markdown last mirrored between the editor and `value`. The re-seed effect
  // below compares against this so it fires only on *external* `value` changes
  // (e.g. navigating to another area) and never on the editor's own edits.
  let lastSynced = String(initialValue)

  let editorState = $state<{ editor: Editor | null }>({ editor: null })
  const isEmpty = $derived(String(value).trim().length === 0)

  // --- `@` reference picker ---------------------------------------------------
  interface PickerState {
    command: ((item: EntityItem) => void) | null
    index: number
    open: boolean
    query: string
  }
  let picker = $state<PickerState>({ command: null, index: 0, open: false, query: '' })

  const search = entitySearch({
    open: () => picker.open,
    query: () => picker.query,
    regionFks: () => (regionFk == null ? [] : [regionFk]),
  })

  const selectItem = (item: EntityCandidate) => {
    picker.command?.({ id: item.id, label: item.label, type: item.type })

    // Closed a task later, so the list is still in the document while the press that chose it is
    // still being dispatched. Removing it mid-dispatch leaves the event's target detached, and a
    // listener further up that asks "did this happen inside me?" answers no for a press that was
    // plainly inside. The bottom sheet's dismiss-on-outside-press is such a listener, which is
    // the shape of a phone tap on a name closing the whole comment sheet.
    setTimeout(() => {
      picker.open = false
    })
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
        // One layer per press. `svelte-bottom-sheet` closes the topmost sheet on Escape from a
        // document listener, so without this, dismissing the name picker inside a comment sheet
        // dismissed the conversation with it.
        event.stopPropagation()
        return true
      default:
        return false
    }
  }

  const suggestion: Omit<SuggestionOptions<EntityItem, EntityItem>, 'editor'> = {
    char: '@',
    command: ({ editor, props, range }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { attrs: { id: String(props.id), label: props.label, type: props.type }, type: REFERENCE_NODE_NAME },
          { text: ' ', type: 'text' },
        ])
        .run()
    },
    // The candidate list is reactive (`entitySearch`); the suggestion plugin
    // only drives the trigger, query, range and keyboard lifecycle.
    items: () => [],
    render: () => ({
      onExit: () => {
        picker.open = false
      },
      onKeyDown: ({ event }) => onPickerKeyDown(event),
      onStart: (props: SuggestionProps<EntityItem, EntityItem>) => {
        picker = { command: props.command, index: 0, open: true, query: props.query }
      },
      onUpdate: (props: SuggestionProps<EntityItem, EntityItem>) => {
        picker = { command: props.command, index: 0, open: true, query: props.query }
      },
    }),
  }

  const referenceExtension = createReferenceExtension({
    resolveLabel: (type, id) => search.resolveLabel(type, id),
    suggestion,
  })

  // --- Editor lifecycle -------------------------------------------------------
  const mountEditor: Attachment<HTMLElement> = (node) => {
    const editor = new Editor({
      content: String(initialValue),
      contentType: 'markdown',
      element: node,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          code: false,
          codeBlock: false,
          heading: false,
          horizontalRule: false,
          link: { openOnClick: false },
          orderedList: false,
          strike: false,
          underline: false,
        }),
        Markdown,
        referenceExtension,
        ...(onsend == null
          ? []
          : [
              submitOnEnter(
                () => onsend(),
                () => picker.open,
              ),
            ]),
      ],
      onTransaction: ({ editor }) => {
        editorState = { editor }
      },
      onUpdate: ({ editor }) => {
        lastSynced = editor.getMarkdown()
        value = lastSynced
      },
    })
    editorState = { editor }

    return () => editor.destroy()
  }

  /**
   * Tell the surrounding remote form what the editor holds.
   *
   * A remote form field learns a value from an `input` event on a named control, and a hidden
   * input whose value is set programmatically fires none. Without this the tracked value stays at
   * whatever the parent seeded, and any parent that UNMOUNTS this editor and mounts it again
   * re-seeds it from that stale value: the block form's map-picker step does exactly that, so
   * writing a description and then placing the pin used to save the old text back (or, on the add
   * form, nothing at all). Attached rather than effected so it runs after the DOM value is written.
   *
   * `lastPublished` is what keeps this from feeding itself: the event updates the form's tracked
   * value, which is where `value` comes from, so an unguarded dispatch re-triggers this attachment
   * for as long as the two disagree by even a normalisation.
   */
  let lastPublished = String(initialValue)
  const publish: Attachment<HTMLInputElement> = (node) => {
    const markdown = String(value)
    if (markdown === lastPublished) {
      return
    }
    lastPublished = markdown
    node.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // Re-seed the document when `value` changes from outside the editor. This
  // component is reused across area navigations and the parent seeds the form
  // field in an effect that runs *after* mount, so `initialValue` is stale:
  // without this the editor shows the previous area's description (or nothing).
  $effect(() => {
    const editor = editorState.editor
    const incoming = String(value)
    if (editor != null && incoming !== lastSynced) {
      lastSynced = incoming
      editor.commands.setContent(incoming, { contentType: 'markdown', emitUpdate: false })
    }
  })

  // Stored markdown is only `!type:id!`, so chips parse with empty labels: the
  // same id→name resolver the read-only renderer uses fills them in as Zero
  // syncs the names down. Label changes don't affect the markdown output, so
  // patching the nodes here neither loops nor dirties the form value.
  const references = markdownReferences(() => getReferences(String(value)))

  $effect(() => {
    const editor = editorState.editor
    const resolved = references.data
    if (editor == null || resolved.length === 0) {
      return
    }

    let tr = editor.state.tr
    let changed = false
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== REFERENCE_NODE_NAME) {
        return
      }
      const name = resolved.find((ref) => ref.type === node.attrs.type && String(ref.id) === node.attrs.id)?.name
      if (name != null && name !== node.attrs.label) {
        tr = tr.setNodeAttribute(pos, 'label', name)
        changed = true
      }
    })

    if (changed) {
      editor.view.dispatch(tr.setMeta('addToHistory', false))
    }
  })

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
      return { href: '', text: '' }
    }
    const { from, to } = editor.state.selection
    return {
      href: (editor.getAttributes('link').href as string | undefined) ?? '',
      text: editor.state.doc.textBetween(from, to, ' '),
    }
  }

  /**
   * Keep the caret in the editor while the reference picker is being pressed.
   *
   * The standard autocomplete trick, and here it is load-bearing rather than tidy: choosing a name
   * must not move focus out of the editable region, because on a phone that dismisses the on-screen
   * keyboard, and a keyboard closing under a bottom sheet resizes the visual viewport and takes the
   * sheet with it. The reader taps a person and the whole conversation goes away.
   *
   * A listener rather than an `onpointerdown` on the markup, so a plain container does not have to
   * claim an ARIA role it does not have. `click` still fires, so selection is unaffected.
   */
  const keepFocus: Attachment<HTMLElement> = (node) => {
    const swallow = (event: PointerEvent) => event.preventDefault()

    // Only `pointerdown`, and deliberately not `click`. Svelte 5 delegates click at the ROOT, so
    // a `stopPropagation` here never lets the list's own button handler run at all: the sheet
    // stopped closing and choosing a name stopped working with it.
    node.addEventListener('pointerdown', swallow)

    return () => node.removeEventListener('pointerdown', swallow)
  }

  const applyLink = ({ href, text }: { href: string; text: string }) => {
    const editor = editorState.editor
    if (editor == null) {
      return
    }
    editor
      .chain()
      .focus()
      .insertContent({ marks: [{ attrs: { href }, type: 'link' }], text: text.length > 0 ? text : href, type: 'text' })
      .run()
  }
</script>

<!-- Focus is tracked on the WRAPPER, not on the editor: pressing a toolbar button takes focus off
     the editable region first, so an editor-level blur would fold the toolbar away underneath the
     press it is answering. `focusin`/`focusout` bubble, so a button inside keeps the box focused. -->
<div
  class="border-surface-200-800 bg-surface-100-900 overflow-hidden rounded-2xl border"
  onfocusin={() => (focused = true)}
  onfocusout={(event) => {
    focused = event.currentTarget.contains(event.relatedTarget as Node | null)
  }}
>
  <!-- Toolbar. `flex-wrap` because the compact box is as narrow as a phone screen minus an avatar
       and a send button: seven 40px targets and two rules do not fit on one line there, and a
       toolbar that overflows a rounded box puts the last tools under the border where they cannot
       be pressed. Wrapping costs a second row only on the widths where the alternative is a
       clipped one. -->
  <!-- Rendered conditionally rather than hidden, so it can slide: a compact box is one line tall
       until it is used, and the toolbar appearing is the box growing. `slide` animates the height
       it takes, which is the thing that actually moves everything below it. The full editor never
       hides its toolbar, so nothing animates there. -->
  {#if toolbarShown}
    <div
      class={['border-surface-200-800 flex items-center gap-1 border-b px-2 py-1.5', compact && 'flex-wrap']}
      transition:slide={{ duration: compact && !still.current ? 130 : 0 }}
    >
      {#snippet tool(icon: 'at-sign' | 'bold' | 'italic' | 'list', label: string, active: boolean, onclick: () => void)}
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

      {#snippet action(icon: 'redo' | 'undo', label: string, disabled: boolean, onclick: () => void)}
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
      <LinkModal active={isActive('link')} getInitial={getLinkSelection} onsubmit={applyLink} bind:open={linkOpen} />

      <span class="bg-surface-300-700 mx-1 h-5 w-px"></span>

      {@render tool('at-sign', m.editor_mention(), false, triggerMention)}
    </div>
  {/if}

  <!-- Editable area -->
  <div class="relative">
    <div class={['editor-host', compact && 'editor-host-compact']} {...rest} {@attach mountEditor}></div>
    {#if isEmpty && placeholder}
      <span class={['text-surface-600-400 pointer-events-none absolute left-3 text-sm', compact ? 'top-2' : 'top-3']}>
        {placeholder}
      </span>
    {/if}
  </div>

  <!-- Submitted value: the form reads FormData from the DOM, so the markdown
       needs a real named control. -->
  {#if name}
    <input type="hidden" {name} value={String(value)} {@attach publish} />
  {/if}

  <!-- In-flow reference picker (per design, not a caret-floating popover) -->
  {#if picker.open}
    <!-- See `keepFocus`: pressing a name must not take focus (and with it the phone's keyboard, and
         with that the sheet the composer is in) out of the editor.

         It slides rather than appears: this list is up to 16rem tall and opens under a composer
         that is pinned to the bottom of a sheet, so an instant one shoves the whole conversation
         up by a quarter of the screen between two keystrokes. -->
    <div
      class="border-surface-200-800 max-h-64 overflow-y-auto border-t"
      transition:slide={{ duration: still.current ? 0 : 130 }}
      {@attach keepFocus}
    >
      <EntityList groups={search.groups} activeIndex={picker.index} onselect={selectItem} />
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

  /* One line to start with, growing with what is typed, and capped where a composer would
     otherwise eat the thread it sits under.

     2.25rem exactly, because the avatar and the send button beside it are 2.25rem too, and the
     border adds the last two pixels: three parts of the same height on one baseline is the only
     arrangement that reads as a row rather than as a box with two things floating next to it. */
  .editor-host-compact :global(.ProseMirror) {
    /* 34px of content under a 1px border on each side is 36px of box, which is what the avatar
       and the send button beside it measure. */
    min-height: 2.125rem;
    max-height: 40dvh;
    overflow-y: auto;
    padding: 0.35rem 0.75rem;
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
