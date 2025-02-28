<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
</script>

<svelte:head>
  <title>Error {page.status} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex flex-col items-center justify-center min-h-[70vh] px-4">
  <div class="card w-full max-w-2xl variant-filled-surface p-8 space-y-8">
    <!-- Error Icon/Illustration -->
    <div class="flex justify-center">
      <div class="bg-error-500/20 p-6 rounded-full">
        <i class="fa-solid fa-triangle-exclamation text-error-500 text-5xl"></i>
      </div>
    </div>

    <!-- Error Title -->
    <div class="text-center space-y-2">
      <h1 class="h1 font-bold tracking-wide text-error-500">{page.status}</h1>
      <h2 class="h3">Oops! Something went wrong</h2>
    </div>

    <!-- Error Message -->
    <div class="card p-4 variant-soft-error">
      <p class="text-center font-medium">{page.error?.message || 'An unexpected error occurred'}</p>
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/" class="btn variant-filled-primary w-full sm:w-auto">
        <i class="fa-solid fa-home mr-2"></i>
        Return Home
      </a>
      <button class="btn variant-soft w-full sm:w-auto" on:click={() => history.back()}>
        <i class="fa-solid fa-arrow-left mr-2"></i>
        Go Back
      </button>
    </div>
  </div>

  <!-- Additional help text -->
  <p class="mt-8 text-center text-sm opacity-75">
    If this problem persists, please contact support or try again later.
  </p>
</div>
