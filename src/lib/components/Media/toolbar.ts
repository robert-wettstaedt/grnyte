// The glass preset's shadow beats the zero-specificity brand focus ring in app.css.
export const MEDIA_FOCUS_RING =
  'focus-visible:[box-shadow:0_0_0_2px_var(--color-surface-50-950),0_0_0_4px_var(--focus-ring)]!'

// The 48px glass square every media toolbar button wears. `shrink-0` is part of it: these sit in
// a flex row and have to keep the tap target.
export const MEDIA_TOOL = `btn preset-glass-neutral btn-lg h-12 w-12 shrink-0 px-0 ${MEDIA_FOCUS_RING}`
