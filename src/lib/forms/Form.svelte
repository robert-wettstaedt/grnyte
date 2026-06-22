<script lang="ts" generics="Input extends RemoteFormInput">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { RemoteForm, RemoteFormInput } from '@sveltejs/kit'
  import { tick, type Snippet } from 'svelte'
  import FormError from './FormError.svelte'

  // Generic chrome for a full-screen remote form: sticky Cancel · title · Submit header,
  // form-level error banner, and a centered column for the caller's fields.
  interface Props {
    children: Snippet
    form: RemoteForm<Input, unknown>
    onCancel: () => void
    submitLabel: string
    title: string
  }

  const { children, form, onCancel, submitLabel, title }: Props = $props()

  // A submit that throws while the browser reports no connection is an offline
  // failure — swap the form for the offline state. We trust navigator.onLine
  // only when false (false positives are common, false negatives are not) and
  // rethrow anything else so real server errors surface as form issues.
  let offline = $state(false)
  let formEl = $state<HTMLFormElement>()
</script>

<!-- Back online → restore the form; the remote form keeps the entered values. -->
<svelte:window ononline={() => (offline = false)} />

{#if offline}
  <ErrorState type="offline" />
{:else}
  <form
    bind:this={formEl}
    {...form.enhance(async ({ submit }) => {
      try {
        await submit()
        await tick()
        formEl?.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center' })
      } catch (error) {
        if (!navigator.onLine) {
          offline = true
          return
        }
        throw error
      }
    })}
    class="mx-auto flex min-h-full w-full max-w-screen-sm flex-col"
  >
    <header
      class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex items-center justify-between gap-3 border-b py-3 pr-4 backdrop-blur"
    >
      <button class="btn preset-tonal-surface" onclick={onCancel} type="button">
        {m.common_cancel()}
      </button>

      <span class="text-sm font-bold">{title}</span>

      <button class="btn preset-filled-primary-500" disabled={form.pending > 0} type="submit">
        {#if form.pending > 0}
          <LoadingIndicator />
        {/if}

        {submitLabel}
      </button>
    </header>

    <div class="flex flex-col gap-7 px-4 py-6">
      <FormError {form} />

      {@render children()}
    </div>
  </form>
{/if}
