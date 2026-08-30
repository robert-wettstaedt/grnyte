<script lang="ts">
  import ProsePage from '$lib/components/ProsePage/ProsePage.svelte'
  import type { Snippet } from 'svelte'
  import { legalLinks } from './links'

  const { children }: { children: Snippet } = $props()
</script>

<ProsePage links={legalLinks()}>
  {@render children()}
</ProsePage>
