<script lang="ts">
  import Markdown from '$lib/components/Markdown/Markdown.svelte'

  interface Props {
    /** The row's markdown body. Renders nothing when blank, so callers need no guard. */
    markdown?: string
  }

  const { markdown }: Props = $props()
</script>

<!-- The secondary line every entity row renders the same way: one clamped line of markdown with
     its links inert (the row itself is the link) and its entity references shown as plain bold. -->
{#if markdown != null && markdown.trim() !== ''}
  <Markdown className="short" disableLinks encloseReferences="strong" {markdown} />
{/if}
