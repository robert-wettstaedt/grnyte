<script lang="ts">
  import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
  import { enhance } from '$lib/forms/enhance.svelte'
  import { createRegion } from './data.remote'
</script>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-md p-6">
  <h2 class="h3 mb-4 text-center">Thank you for signing up for {PUBLIC_APPLICATION_NAME}</h2>

  <p class="mb-4 text-center opacity-75">
    You are not currently a member of any regions. You need to be invited by a region admin to join a region.
  </p>

  <p class="mb-4 text-center opacity-75">Or you can create a new region here:</p>

  <form {...createRegion.enhance(enhance)} class="flex items-end">
    <label class="label">
      <span>Region name</span>
      <input
        class="input h-[34px] rounded-tr-none rounded-br-none"
        name="name"
        placeholder="Enter name..."
        type="text"
      />
    </label>

    <button
      aria-label="Create region"
      class="btn-icon preset-filled-primary-500 h-[18px] rounded-tl-none rounded-bl-none"
      type="submit"
    >
      <i class="fa-solid fa-chevron-right"></i>
    </button>
  </form>

  {#if PUBLIC_TOPO_EMAIL}
    <p class="mt-6 text-center opacity-75">
      If you need support or want to be invited to an existing region, please reach out to us at
      <a class="anchor" href="mailto:{PUBLIC_TOPO_EMAIL}">{PUBLIC_TOPO_EMAIL}</a>.
    </p>
  {/if}
</div>
