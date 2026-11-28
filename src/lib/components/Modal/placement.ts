/** The app frame's box, below the status bar; the `(app)` layout keeps `--app-frame-top` current.
 *  Dialogs portal to `<body>`, so a panel lined up with the frame's chrome is fixed to this box. */
export const FRAME_BOX = 'fixed inset-x-0 bottom-0 top-[var(--app-frame-top,0px)]'

/** Desktop panel beside the explore sheet: its right edge (`left-27` plus `max-w-sm` / `lg:max-w-md`)
 *  plus a gap. Cap heights in `%`, not `dvh`, so they follow the shorter box under the status bar. */
export const besideSheet = `${FRAME_BOX} left-[31.25rem] z-60 flex items-start py-2 lg:left-[35.25rem]`
