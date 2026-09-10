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
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PageHeaderAction from '$lib/components/PageHeader/PageHeaderAction.svelte'
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
  // state was never the whole story: the fields a caller passes in keep their visible state in
  // component `$state`, and that is what renders.
  //
  // An `$effect` on `isOnline()` rather than the `online` window event, which was the trigger
  // before. That event fires when the *browser* decides the network returned, which is a different
  // question, and it does not fire at all in the case that strands somebody: the browser
  // never claimed to be offline, the reachability probe or Zero's hold was what went false, and
  // nothing afterwards told this component otherwise. The form then sat on the error state for the
  // life of the mounted component with everything typed into it behind that tile.
  //
  // `$derived(failedOffline && !isOnline())` is the shape the linter asks for here, and it is not
  // the same behaviour: the latch would stay armed after recovery, so a second connection drop would
  // throw the tile back over a form somebody is quietly filling in, without them having submitted
  // anything. The tile should only ever follow a submit that failed, so the reset is an
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
        // Supplying our own enhance callback replaced Kit's, which clears the form after a
        // successful submit; the values otherwise sit on the remote singleton all session.
        //
        // `fields.set({})` and NOT `element.reset()`: a reset restores each input to its
        // `defaultValue`, which Svelte's property write only reaches for `hidden`, `checkbox` and
        // `radio`, so it blanks exactly the visible fields. `resetBlanks.test.ts` pins it.
        // After `onSubmitted`, which can await: clearing first blanks the form for that wait.
        // `finally` so a throw still clears.
        try {
          await onSubmitted?.()
        } finally {
          form.fields.set({})
        }
      }
    } catch (error) {
      if (!isOnline()) {
        offline = true
        return
      }
      throw error
    }
  })}
  class={['flex w-full flex-col', fill ? 'min-h-0 flex-1' : 'min-h-full', offline && 'hidden']}
  inert={offline}
>
  <!-- The bar is page chrome, so it stays full bleed while the field column below is centred and
       capped. Constraining the form itself inset the bar to 640px on desktop, which read as a
       floating card header beside the full-width one on every other screen. -->
  <PageHeader
    backLabel={stepped && step > 0 ? steps![step - 1].label : m.common_cancel()}
    onback={stepped && step > 0 ? () => (step -= 1) : onCancel}
    {title}
  >
    {#snippet action()}
      {#if stepped && !isLast}
        <PageHeaderAction disabled={!canContinue} icon="arrow-right" iconAfter label={nextLabel} onclick={advance} />
      {:else}
        <PageHeaderAction
          disabled={form.pending > 0 || submitDisabled || !canContinue}
          label={submitLabel}
          pending={form.pending > 0}
          type="submit"
        />
      {/if}
    {/snippet}
  </PageHeader>

  {#if stepped}
    <!-- Hairline full bleed like the header's, stepper aligned with the fields below it. -->
    <div class="border-surface-200-800 flex-none border-b">
      <Steps
        class="mx-auto w-full max-w-screen-sm px-4 py-2.5"
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
    </div>
  {/if}

  <div class={fill ? 'flex min-h-0 flex-1 flex-col' : 'mx-auto flex w-full max-w-screen-sm flex-col gap-7 px-4 py-6'}>
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
