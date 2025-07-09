<script lang="ts">
  import Page from '../../../areas/[...slugs]/+page.svelte'

  const props = $props()
</script>

<Page {...props} />
