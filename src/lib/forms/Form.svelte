<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export interface FormStep {
    body: Snippet
    /** Gate the header's primary button for this step (Next, or Submit on the last step). Default true. */
    canContinue?: boolean
    label: string
    /** Side-effect when leaving this step forwards, e.g. seed state for the next step. */
    onContinue?: () => Promise<void> | void
  }
</script>

<script lang="ts" generics="Input extends RemoteFormInput">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import { isOnline } from '$lib/state/online.svelte'
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
    /** Fill the container with an edge-to-edge body (e.g. a map picker) instead of the
     *  default scrolling, padded field column. Fills as a flex item (not `h-full`), so it
     *  still chains height through QueryState's `min-h-full` wrapper. */
    fill?: boolean
    form: RemoteForm<Input, unknown>
    /** Label for the advance button on non-final steps. */
    nextLabel?: string
    /** Run just before the form submits; return `false` to cancel it (e.g. to surface a
     *  confirmation first, then resubmit). Not called when advancing through wizard steps. */
    onBeforeSubmit?: () => boolean | Promise<boolean>
    onCancel: () => void
    /** Run after a successful submit (validation passed, handler returned). Use to act on
     *  `form.result` when the handler returns data instead of redirecting server-side. */
    onSubmitted?: () => Promise<void> | void
    /** Current step index (0-based), bindable so callers can read/seed it. */
    step?: number
    /** Provide to render a multi-step form. The default `children` snippet is then used for
     *  form-wide content (e.g. hidden inputs), rendered on every step. */
    steps?: FormStep[]
    /** Gate submit on a caller precondition, on top of the built-in pending state. */
    submitDisabled?: boolean
    submitLabel: string
    title: string
  }

  let {
    children,
    fill = false,
    form,
    nextLabel = m.common_next(),
    onBeforeSubmit,
    onCancel,
    onSubmitted,
    step = $bindable(0),
    steps,
    submitDisabled = false,
    submitLabel,
    title,
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

  // A submit that throws while we have no connection is an offline failure: swap the form for the
  // offline state and rethrow anything else, so real server errors still surface as form issues.
  //
  // `isOnline()` rather than `navigator.onLine`, which is the whole reason that module exists. The
  // raw flag reads true on a fresh document load with the network already dead, so this branch was
  // skipped, the error was rethrown, and `+error.svelte` replaced the entire page with "something
  // went wrong on our end" while the status bar above it said "you're offline". Everything typed in
  // was lost, which is the one outcome a form must never produce for a cause it can recognise.
  let offline = $state(false)

  // Back online → restore the form. Everything typed survives because the form is never unmounted:
  // the offline state renders over it, see the note above the markup. The remote form's own module
  // state was never the whole story - the fields a caller passes in keep their visible state in
  // component `$state`, and that is what renders.
  //
  // An `$effect` on `isOnline()` rather than the `online` window event, which was the trigger
  // before. That event fires when the *browser* decides the network returned, which is a different
  // question, and it does not fire at all in the case that actually strands somebody: the browser
  // never claimed to be offline, the reachability probe or Zero's hold was what went false, and
  // nothing afterwards told this component otherwise. The form then sat on the error state for the
  // life of the mounted component with everything typed into it behind that tile.
  //
  // `$derived(failedOffline && !isOnline())` is the shape the linter asks for here, and it is not
  // the same behaviour: the latch would stay armed after recovery, so a second connection drop would
  // throw the tile back over a form somebody is quietly filling in, without them having submitted
  // anything. The tile should only ever follow a submit that actually failed, so the reset is an
  // effect on purpose.
  $effect(() => {
    if (isOnline()) {
      offline = false
    }
  })
</script>

<!-- The offline state goes *over* the form, never instead of it.

     Swapping the two unmounts the whole subtree, and the fields a caller passes as children keep
     their visible state in component `$state` rather than in the remote form: `AscentFormFields`
     alone has six, including the date. Remounting reset every one of them, and the date reset to
     *today* - which does not look empty, it looks filled in. Somebody logging yesterday's session at
     a crag got the form back, saw a plausible date and submitted the wrong day into their logbook.
     A blank toggle is an annoyance; a silently wrong date in a logbook is a data-correctness bug.
     `step` has the same shape one level up: it lives outside this branch, so a swap returned a
     stepped form to step 3 with steps 1 and 2 blank.

     Keeping it mounted fixes all of that for every form at once, with no per-form work. `hidden`
     rather than opacity, and `inert` with it: an overlay over a form that is still focusable and
     still in the accessibility tree trades a data bug for an a11y one. -->
{#if offline}
  <ErrorState type="offline" />
{/if}

<form
  {...form.enhance(async ({ element, submit }) => {
    if (onBeforeSubmit != null && !(await onBeforeSubmit())) {
      return
    }
    try {
      const succeeded = await submit()
      await tick()
      element.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center' })
      if (succeeded) {
        await onSubmitted?.()
      }
    } catch (error) {
      if (!isOnline()) {
        offline = true
        return
      }
      throw error
    }
  })}
  class={['flex w-full flex-col', fill ? 'min-h-0 flex-1' : 'mx-auto min-h-full max-w-screen-sm', offline && 'hidden']}
  inert={offline}
>
  <!-- Same shape as components/PageHeader: sticky bar, 32px back chip, left-aligned h3 title.
         Not PageHeader itself because this one also carries a trailing submit and the stepper. -->
  <header
    class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex items-center gap-3 border-b px-3 py-3 backdrop-blur"
  >
    <!-- Icon-only below sm, icon plus label from sm up: German labels ("Abbrechen", "Speichern")
           ate so much of a phone-width bar that the title truncated. -->
    {#if stepped && step > 0}
      <button
        class="btn preset-filled-surface-200-800 size-8 flex-none px-0 sm:size-auto sm:px-4"
        onclick={() => (step -= 1)}
        type="button"
        aria-label={steps![step - 1].label}
      >
        <Icon name="arrow-left" size={18} />
        <span class="hidden sm:inline">{steps![step - 1].label}</span>
      </button>
    {:else}
      <button
        class="btn preset-filled-surface-200-800 size-8 flex-none px-0 sm:size-auto sm:px-4"
        onclick={onCancel}
        type="button"
        aria-label={m.common_cancel()}
      >
        <Icon name="arrow-left" size={18} />
        <span class="hidden sm:inline">{m.common_cancel()}</span>
      </button>
    {/if}

    <!-- Same treatment as components/PageHeader's `title` - change the two together. In flow
           rather than absolutely centred, so a long title truncates instead of running under the
           buttons. -->
    <h1 class="min-w-0 flex-1 truncate text-center text-sm font-bold">{title}</h1>

    {#if stepped && !isLast}
      <button
        class="btn preset-filled-primary-500 size-8 flex-none px-0 sm:size-auto sm:px-4"
        disabled={!canContinue}
        onclick={advance}
        type="button"
        aria-label={nextLabel}
      >
        <!-- Icon after the label here: it points forward, so "Weiter →" reads right where the
               back and submit buttons want their icon in front. -->
        <span class="hidden sm:inline">{nextLabel}</span>
        <Icon name="arrow-right" size={18} />
      </button>
    {:else}
      <button
        class="btn preset-filled-primary-500 size-8 flex-none px-0 sm:size-auto sm:px-4"
        disabled={form.pending > 0 || submitDisabled || !canContinue}
        type="submit"
        aria-label={submitLabel}
      >
        {#if form.pending > 0}
          <LoadingIndicator class="items-center justify-center" />
        {:else}
          <Icon name="check" size={18} />
        {/if}
        <span class="hidden sm:inline">{submitLabel}</span>
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
