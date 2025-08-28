<script lang="ts">
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

  interface Props {
    error?: App.Error | null
    reset?: () => void
    status?: number | null
  }

  const errors: Record<number, string | undefined> = {
    401: 'You do not have permission to access this resource.',
    404: 'The page you are looking for does not exist.',
    500: 'An unexpected error occurred on the server.',
  }

  const errorMessage = $derived.by(() => {
    if (error?.message != null) {
      return error.message
    }

    if (status != null && errors[status] != null) {
      return errors[status]
    }

    return 'An unexpected error occurred'
  })

  const { error = page.error, reset, status = page.status }: Props = $props()

  afterNavigate(() => reset?.())
</script>

<svelte:head>
  <title>Error {status} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex min-h-[70vh] flex-col items-center justify-center px-4">
  <div class="card variant-filled-surface w-full max-w-2xl space-y-8 p-8">
    <!-- Error Icon/Illustration -->
    <div class="flex justify-center">
      <div class="bg-error-500/20 rounded-full p-6">
        <i class="fa-solid fa-triangle-exclamation text-error-500 text-5xl"></i>
      </div>
    </div>

    <!-- Error Title -->
    <div class="space-y-2 text-center">
      <h1 class="h1 text-error-500 font-bold tracking-wide">{status}</h1>
      <h2 class="h3">Oops! Something went wrong</h2>
    </div>

    <!-- Error Message -->
    <div class="card variant-soft-error p-4">
      <p class="text-center font-medium">{errorMessage}</p>
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-col justify-center gap-4 sm:flex-row">
      <a href="/" class="btn variant-filled-primary w-full sm:w-auto">
        <i class="fa-solid fa-home mr-2"></i>
        Return Home
      </a>
      <button class="btn variant-soft w-full sm:w-auto" onclick={() => history.back()}>
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
