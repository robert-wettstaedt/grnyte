<script lang="ts">
  import { page } from '$app/state'
  import LayerForm from '../LayerForm.svelte'
</script>

{#key page.params.layer}
  <LayerForm segment={page.params.layer} />
{/key}
