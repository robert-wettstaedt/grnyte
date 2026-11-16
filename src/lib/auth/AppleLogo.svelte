<script lang="ts">
  // Apple's mark in the button's own colour; a brand mark, so not an `Icon`.
  // shortcut: path drawn to Apple's proportions, not Apple's file; swap in the official mark before release.
  const { class: className = '' }: { class?: string } = $props()
</script>

<svg class={className} viewBox="0 0 17 20" fill="currentColor" aria-hidden="true" focusable="false">
  <path
    d="M14.2 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1ZM11.6 3c.7-.9 1.2-2 1-3.2-1 .1-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z"
  />
</svg>
