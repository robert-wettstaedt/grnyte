<script lang="ts">
  // Google's official "G" (sign-in branding assets, 2026), unaltered as the guidelines require; an
  // <img>, so its internal ids never clash when several render on one page.
  const { class: className = '' }: { class?: string } = $props()
</script>

<img class={className} src="/google-g.svg" alt="" aria-hidden="true" width="20" height="20" />
