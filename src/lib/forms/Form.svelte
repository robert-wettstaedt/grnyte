<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export interface FormStep {
    label: string
    body: Snippet
    /** Gate the header's primary button for this step (Next, or Submit on the last step). Default true. */
    canContinue?: boolean
    /** Side-effect when leaving this step forwards, e.g. seed state for the next step. */
    onContinue?: () => void | Promise<void>
  }
</script>

<script lang="ts" generics="Input extends RemoteFormInput">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Steps } from '@skeletonlabs/skeleton-svelte'
  import type { RemoteForm, RemoteFormInput } from '@sveltejs/kit'
  import { tick } from 'svelte'
  import FormError from './FormError.svelte'

  // Generic chrome for a full-screen remote form: sticky Cancel · title · Submit header,
  // form-level error banner, and a centered column for the caller's fields. Pass `steps`
  // to turn it into a multi-step wizard (stepper indicator + per-step body, with the
  // primary button advancing through steps before submitting on the last one).
  interface Props {
    children?: Snippet
    form: RemoteForm<Input, unknown>
    onCancel: () => void
    submitLabel: string
    title: string
    /** Fill the container with an edge-to-edge body (e.g. a map picker) instead of the
     *  default scrolling, padded field column. Needs a definite-height parent. */
    fill?: boolean
    /** Gate submit on a caller precondition, on top of the built-in pending state. */
    submitDisabled?: boolean
    /** Provide to render a multi-step form. The default `children` snippet is then used for
     *  form-wide content (e.g. hidden inputs), rendered on every step. */
    steps?: FormStep[]
    /** Current step index (0-based), bindable so callers can read/seed it. */
    step?: number
    /** Label for the advance button on non-final steps. */
    nextLabel?: string
  }

  let {
    children,
    form,
    onCancel,
    submitLabel,
    title,
    fill = false,
    submitDisabled = false,
    steps,
    step = $bindable(0),
    nextLabel = m.common_next(),
  }: Props = $props()

  const stepped = $derived(steps != null && steps.length > 0)
  const current = $derived(stepped ? steps![Math.min(step, steps!.length - 1)] : undefined)
  const isLast = $derived(!stepped || step >= steps!.length - 1)
  const canContinue = $derived(current?.canContinue ?? true)

  const advance = async () => {
    if (!canContinue) return
    await current?.onContinue?.()
    step += 1
  }

  // A submit that throws while the browser reports no connection is an offline
  // failure — swap the form for the offline state. We trust navigator.onLine
  // only when false (false positives are common, false negatives are not) and
  // rethrow anything else so real server errors surface as form issues.
  let offline = $state(false)
</script>

<!-- Back online → restore the form; the remote form keeps the entered values. -->
<svelte:window ononline={() => (offline = false)} />

{#if offline}
  <ErrorState type="offline" />
{:else}
  <form
    {...form.enhance(async ({ submit, element }) => {
      try {
        await submit()
        await tick()
        element.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center' })
      } catch (error) {
        if (!navigator.onLine) {
          offline = true
          return
        }
        throw error
      }
    })}
    class={['flex w-full flex-col', fill ? 'h-full' : 'mx-auto min-h-full max-w-screen-sm']}
  >
    <header
      class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur"
    >
      {#if stepped && step > 0}
        <button
          class="btn preset-tonal-surface"
          onclick={() => (step -= 1)}
          type="button"
          aria-label={steps![step - 1].label}
        >
          <Icon name="arrow-left" size={16} />
          <span class="hidden sm:inline">{steps![step - 1].label}</span>
        </button>
      {:else}
        <button class="btn preset-tonal-surface" onclick={onCancel} type="button">{m.common_cancel()}</button>
      {/if}

      <!-- Absolutely centred so the unequal side buttons can't push it off-centre on mobile. -->
      <span class="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-bold whitespace-nowrap">
        {title}
      </span>

      {#if stepped && !isLast}
        <button class="btn preset-filled-primary-500" disabled={!canContinue} onclick={advance} type="button">
          {nextLabel}
        </button>
      {:else}
        <button
          class="btn preset-filled-primary-500"
          disabled={form.pending > 0 || submitDisabled || !canContinue}
          type="submit"
        >
          {#if form.pending > 0}
            <LoadingIndicator />
          {/if}
          {submitLabel}
        </button>
      {/if}
    </header>

    {#if stepped}
      <Steps
        class="border-surface-200-800 flex-none border-b px-4 py-2.5"
        count={steps!.length}
        {step}
        onStepChange={(details) => (step = details.step)}
      >
        <Steps.List>
          {#each steps! as { label }, index (index)}
            <Steps.Item {index}>
              <Steps.Indicator class="size-6 text-xs font-bold">{index + 1}</Steps.Indicator>
              <span class="text-xs font-semibold whitespace-nowrap">{label}</span>
              {#if index < steps!.length - 1}
                <Steps.Separator />
              {/if}
            </Steps.Item>
          {/each}
        </Steps.List>
      </Steps>
    {/if}

    <div class={fill ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col gap-7 px-4 py-6'}>
      <FormError {form} />

      {#if stepped}
        {@render current!.body()}
      {:else}
        {@render children?.()}
      {/if}
    </div>

    <!-- Multi-step: form-wide content (hidden inputs) that must submit from any step. -->
    {#if stepped}
      {@render children?.()}
    {/if}
  </form>
{/if}
