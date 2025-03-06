<script>
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import TagFormFields from '$lib/components/TagFormFields'

  let { form } = $props()
</script>

<svelte:head>
  <title>Create tag - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create tag</span>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" method="POST" use:enhance>
  <TagFormFields id={form?.id ?? ''} />

  <div class="mt-8 flex justify-between">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit">
      <i class="fa-solid fa-floppy-disk"></i> Save tag
    </button>
  </div>
</form>
