import { Extension } from '@tiptap/core'

/**
 * Enter sends, Shift+Enter breaks the line.
 *
 * ProseMirror owns the keys inside the editor, so a chat box built on it cannot do this with a
 * `keydown` handler on the element the way a `<textarea>` does.
 *
 * Three cases hand Enter back:
 *
 * - A soft keyboard, where Enter IS the line break and the send button is right there. `hover:
 *   none` rather than `pointer: coarse`, because a laptop with a touchscreen is both, and its
 *   keyboard is the one that expects Enter to send.
 * - The `@` picker being open, where Enter chooses the highlighted person. Asked rather than
 *   assumed from plugin order: the suggestion plugin and this keymap both answer the same key,
 *   and which one gets it first is an implementation detail of whichever version is installed.
 * - A list, where Enter starts the next item. TipTap reverses the extension array when it builds
 *   the keymaps, so this one is registered LAST and therefore outranks `ListItem`'s own
 *   `splitListItem`: without asking, the toolbar's bullet button would produce lists that can
 *   never have a second item, and pressing Enter for one would post the half-written comment.
 */
export function submitOnEnter(onsubmit: () => void, pickerOpen: () => boolean): Extension {
  return Extension.create({
    // A method rather than an arrow, because `this.editor` is what answers the list question and
    // TipTap binds it on the extension.
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          if (pickerOpen() || window.matchMedia('(hover: none)').matches) {
            return false
          }

          // Every node that owns Enter for its own structure. `listItem` covers both list kinds,
          // since StarterKit's ordered and bullet lists are made of the same item node.
          if (['blockquote', 'codeBlock', 'listItem'].some((node) => this.editor.isActive(node))) {
            return false
          }

          onsubmit()
          return true
        },
      }
    },
    name: 'submitOnEnter',
  })
}
