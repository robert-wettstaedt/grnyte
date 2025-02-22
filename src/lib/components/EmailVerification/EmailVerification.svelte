<script lang="ts">
  import { page } from '$app/stores'
  import { convertException } from '$lib/errors'
  import { Modal, ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import { userNeedsEmailVerification } from './lib'

  let showEmailVerification = $state(false)
  let loading = $state(false)
  let errorMsg = $state<string | null>(null)
  let successMsg = $state<string | null>(null)

  onMount(() => {
    if (userNeedsEmailVerification($page.data.session, $page.data.userPermissions)) {
      showEmailVerification = true
    }
  })

  const onResend = async () => {
    if ($page.data.session?.user?.email == null) {
      return
    }

    loading = true
    errorMsg = null

    try {
      const res = await fetch('/api/auth/resend')

      if (!res.ok || res.status >= 400) {
        throw new Error(await res.text())
      }

      successMsg = 'Verification email sent'
    } catch (error) {
      errorMsg = convertException(error)
    }

    loading = false
  }
</script>

<Modal
  bind:open={showEmailVerification}
  triggerBase="!hidden"
  contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
  backdropClasses="backdrop-blur-sm"
>
  {#snippet content()}
    <button
      aria-label="Close"
      class="fixed top-4 right-2 btn preset-filled-primary-500 w-12 h-12 rounded-full z-10"
      onclick={() => (showEmailVerification = false)}
    >
      <i class="fa-solid fa-xmark"></i>
    </button>

    {#if errorMsg != null}
      <aside class="card preset-tonal-warning my-8 p-2 md:p-4 whitespace-pre-line">
        <p>{errorMsg}</p>
      </aside>
    {/if}

    <header>
      <h4 class="h4">Email Verification Required</h4>
    </header>

    {#if successMsg == null}
      <article class="opacity-60">
        <p>Please verify your email address to continue.</p>

        <ul class="list-disc list-inside mt-4">
          <li>Check your email for a verification link</li>
          <li>If you don't see the verification email, check your spam folder</li>
          <li>If you still don't see it, click the button below to resend the verification email</li>
        </ul>
      </article>

      <button class="btn preset-filled-primary-500 mt-8" disabled={loading} onclick={onResend}>
        {#if loading}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}

        Resend verification email
      </button>
    {:else}
      <article class="opacity-60">
        <p>{successMsg}</p>
      </article>
    {/if}
  {/snippet}
</Modal>
