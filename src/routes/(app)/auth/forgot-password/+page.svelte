<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

  let { form } = $props()
</script>

<svelte:head>
  <title>Forgot Password - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex justify-center items-center min-h-[80vh]">
  <div class="card p-8 max-w-lg w-full preset-filled-surface-100-900">
    {#if form?.success}
      <header class="text-center mb-8">
        <h1 class="h1 mb-2">Success</h1>
        <p class="opacity-75">
          We have sent a reset link to your email address {form?.email}.
        </p>
      </header>
    {:else}
      <header class="text-center mb-8">
        <h2 class="h2 mb-2">Forgot Password</h2>
      </header>

      <form method="POST" class="flex flex-col gap-4">
        <label class="label">
          <span>Enter your email</span>
          <input class="input" name="email" placeholder="you@example.com" required type="email" value={form?.email} />
        </label>

        <button type="submit" class="btn preset-filled-primary-500 w-full">
          <i class="fa-solid fa-envelope"></i>
          Send reset link
        </button>
      </form>
    {/if}
  </div>
</div>
