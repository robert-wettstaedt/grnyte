<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { createArea } from './page.remote'
</script>

<svelte:head>
  <title>Create area - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create area</span>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm())}>
  <AreaFormFields parentFk={undefined} regionFk={undefined} />

  <FormActionBar label="Save area" pending={createArea.pending} />
</form>
