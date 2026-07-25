<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'

  // Where /auth/confirm sends a link it could not verify (expired, already used, tampered with).
  // The sign-in link works for both audiences: signed out it is where they need to go, signed in
  // the auth guard bounces them straight home.
</script>

<svelte:head>
  <title>{m.auth_linkInvalid()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="card preset-tonal-error px-4 py-6 text-center text-sm" role="alert">
  <p class="font-bold">{m.auth_linkInvalid()}</p>
  <p class="text-surface-600-400 mt-1">{m.auth_linkInvalidBody()}</p>
  <a href={resolve('/auth/signin')} class="text-primary-400 mt-3 inline-block font-bold">{m.auth_backToSignIn()}</a>
</div>
