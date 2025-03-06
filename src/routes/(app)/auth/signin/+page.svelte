<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_DEMO_MODE } from '$env/static/public'

  let { form } = $props()
</script>

<svelte:head>
  <title>Login - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card preset-filled-surface-100-900 w-full max-w-lg p-8">
    <header class="mb-8 text-center">
      <h1 class="h1 mb-2">Welcome Back</h1>
      <p class="opacity-75">Sign in to continue to {PUBLIC_APPLICATION_NAME}</p>
    </header>

    <form method="POST" class="flex flex-col gap-4" use:enhance>
      <label class="label">
        <span>Email</span>
        <input
          class="input"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
          value={PUBLIC_DEMO_MODE ? 'demo@demo.com' : form?.email}
        />
      </label>

      <label class="label">
        <span>Password</span>
        <input
          class="input"
          name="password"
          placeholder="Enter your password"
          required
          type="password"
          value={PUBLIC_DEMO_MODE ? 'demo' : undefined}
        />
      </label>

      <button type="submit" class="btn preset-filled-primary-500 w-full">
        <i class="fa-solid fa-right-to-bracket"></i>
        Login
      </button>

      <a href="/auth/forgot-password" class="anchor w-full text-right"> Forgot Password? </a>

      <hr class="my-4" />

      <a href="/auth/signup" class="btn preset-outlined-primary-500 w-full">
        <i class="fa-solid fa-user-plus"></i>
        Create Account
      </a>
    </form>
  </div>
</div>
