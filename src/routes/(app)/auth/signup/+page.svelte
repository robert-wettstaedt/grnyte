<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

  let { form } = $props()
</script>

<svelte:head>
  <title>Signup - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card preset-filled-surface-100-900 w-full max-w-lg p-8">
    {#if form?.success}
      <header class="mb-8 text-center">
        <h1 class="h1 mb-2">Success</h1>
        <p class="opacity-75">
          We have sent a confirmation to your email address {form.email}. Please verify your email before signing in.
        </p>
      </header>
    {:else}
      <header class="mb-8 text-center">
        <h1 class="h1 mb-2">Create account</h1>
        <p class="opacity-75">Sign up to continue to {PUBLIC_APPLICATION_NAME}</p>
      </header>

      <form method="POST" class="space-y-4" use:enhance>
        <label class="label">
          <span>Email</span>
          <input name="email" type="email" placeholder="you@example.com" class="input" required value={form?.email} />
        </label>

        <label class="label">
          <span>Username</span>
          <input
            name="username"
            type="text"
            class="input"
            placeholder="Enter your username"
            required
            value={form?.username}
          />
        </label>

        <label class="label">
          <span>Password</span>
          <input name="password" type="password" placeholder="Enter your password" class="input" required />
        </label>

        <label class="label">
          <span>Password confirmation</span>
          <input name="passwordConfirmation" type="password" placeholder="Enter your password" class="input" required />
        </label>

        <!-- Terms & Conditions acceptance -->
        <label class="label mt-6 flex items-start gap-3">
          <input name="acceptTerms" type="checkbox" class="checkbox mt-1" />
          <span class="text-sm leading-5">
            I have read and agree to the
            <a href="/legal/terms" target="_blank" class="anchor">Terms of Service</a>
            and
            <a href="/legal/privacy" target="_blank" class="anchor">Privacy Policy</a>.
          </span>
        </label>

        <div class="mt-8 flex items-center justify-between">
          <button type="submit" class="btn preset-filled-primary-500 w-full">
            <i class="fa-solid fa-right-to-bracket"></i>
            Sign up
          </button>
        </div>

        <div class="divider my-8"></div>

        <div class="flex flex-col gap-4">
          <a href="/auth/signin" class="btn preset-outlined-primary-500">
            <i class="fa-solid fa-user"></i>
            Log into existing account
          </a>
        </div>
      </form>
    {/if}
  </div>
</div>
