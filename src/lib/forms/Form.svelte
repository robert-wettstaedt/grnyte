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

<script lang="ts" generics="Input extends Record<string, unknown>, W extends FormWaits = FormWaits">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PageHeaderAction from '$lib/components/PageHeader/PageHeaderAction.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { MutationResult } from '$lib/remote/mutation'
  import { back, exit } from '$lib/state/navigation.svelte'
  import { isOnline } from '$lib/state/online.svelte'
  import { untrack, type ComponentProps } from 'svelte'
  import FormError from './FormError.svelte'
  import FormGate from './FormGate.svelte'
  import FormSteps from './FormSteps.svelte'
  import type { FormWaits, Waited } from './gate'
  import type { FormStore } from './store.svelte'

  // Generic chrome for a full-screen store form: sticky Cancel · title · Submit header,
  // form-level error banner, and a centered column for the caller's fields. Pass `steps`
  // to turn it into a multi-step wizard (stepper indicator + per-step body, with the
  // primary button advancing through steps before submitting on the last one).
  interface Props {
    /** Where cancelling goes when nothing of the app is behind this screen: its parent, not a
     *  general fallback. With a trail behind us, cancelling goes back instead. */
    cancelTo: string
    children?: Snippet
    /** With `waitFor`: the reader may not use this screen. Shown in the form's chrome instead. */
    denied?: ComponentProps<typeof ErrorState>
    destructive?: boolean
    /** With `waitFor`: the fields, given its rows. Remounted after each seed, since fields seed
     *  their own state once at mount. */
    fields?: Snippet<[Waited<W>]>
    /** Fill the container with an edge-to-edge body (e.g. a map picker) instead of the
     *  default scrolling, padded field column. Fills as a flex item (not `h-full`), so it
     *  still chains height through QueryState's `min-h-full` wrapper. */
    fill?: boolean
    /** Without `waitFor`: the values the screen opens with. */
    initial?: Partial<Input>
    /** Label for the advance button on non-final steps. */
    nextLabel?: string
    /** Run just before the form submits; return `false` to cancel it (e.g. to surface a
     *  confirmation first, then resubmit). Not called when advancing through wizard steps. */
    onBeforeSubmit?: () => boolean | Promise<boolean>
    /** Run after a successful submit, before leaving: work the destination depends on (finalizing
     *  uploads, waiting for a row to sync). Never navigate: `redirectTo` is applied here. */
    onSubmitted?: () => Promise<void> | void
    /** With `waitFor`: the values to seed from its rows, once per set of row ids, before `fields` mount. */
    seed?: (rows: Waited<W>) => Partial<Input>
    /** Stay after a successful submit, for a screen that answers in place. */
    stayOnSubmit?: boolean
    /** Current step index (0-based), bindable so callers can read/seed it. */
    step?: number
    /** Provide to render a multi-step form. The default `children` snippet is then used for
     *  form-wide content, rendered on every step. */
    steps?: FormStep[]
    /** The fields, validated here before `submit`. */
    store: FormStore<Input, unknown>
    /** The write, given the validated values. A rejection shaped like `WriteRejection` lands on
     *  its field; `redirectTo` is where the form leaves for. */
    submit: (values: Input) => Promise<MutationResult<unknown> | void>
    /** Gate submit on a caller precondition, on top of the built-in pending state. */
    submitDisabled?: boolean
    submitLabel: string
    title: string
    /** Rows the fields need. Until they are here the header renders with Save disabled over one
     *  skeleton, and the fields (with whatever they seed at mount) are not mounted yet. */
    waitFor?: W
  }

  let {
    cancelTo,
    children,
    denied,
    destructive = false,
    fields,
    fill = false,
    initial,
    nextLabel = m.common_next(),
    onBeforeSubmit,
    onSubmitted,
    seed,
    stayOnSubmit = false,
    step = $bindable(0),
    steps,
    store,
    submit,
    submitDisabled = false,
    submitLabel,
    title,
    waitFor,
  }: Props = $props()

  untrack(() => {
    if (initial != null) store.fields.set(initial)
  })

  const stepped = $derived(steps != null && steps.length > 0)
  const current = $derived(stepped ? steps![Math.min(step, steps!.length - 1)] : undefined)
  const isLast = $derived(!stepped || step >= steps!.length - 1)
  const canContinue = $derived(current?.canContinue ?? true)
  const stepLabels = $derived(steps?.map(({ label }) => label) ?? [])

  const advance = async () => {
    if (!canContinue) return
    await current?.onContinue?.()
    step += 1
  }

  // An offline submit puts the offline state over the form, which stays mounted with what was typed.
  let offline = $state(false)
  let submitting = $state(false)

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault()
    const element = event.currentTarget as HTMLFormElement
    if (submitting) return
    if (onBeforeSubmit != null && !(await onBeforeSubmit())) return

    submitting = true
    try {
      // The raw values, not the parsed ones: the mutator validates the same input again.
      const outcome = await store.submit(submit)
      if (outcome.kind === 'offline') {
        // The overlay keeps the form mounted under it, with everything typed.
        offline = true
      } else if (outcome.kind !== 'done') {
        element.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center' })
      } else {
        await onSubmitted?.()
        // `exit`, never a push: a finished form must not be reachable by going back.
        if (!stayOnSubmit) await exit(outcome.result?.redirectTo ?? cancelTo)
      }
    } finally {
      submitting = false
    }
  }

  // Back online → restore the form. Everything typed survives because the form is never unmounted:
  // the offline state renders over it, see the note above the markup.
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

{#if waitFor == null}
  {@render screen()}
{:else}
  <FormGate
    action={stepped && !isLast
      ? { icon: 'arrow-right', iconAfter: true, label: nextLabel }
      : { destructive, label: submitLabel }}
    {cancelTo}
    {denied}
    {fill}
    seed={seed && ((rows) => store.fields.set(seed(rows)))}
    steps={stepLabels}
    {title}
    {waitFor}
  >
    {#snippet children(rows, seeded)}
      {@render screen(rows, seeded)}
    {/snippet}
  </FormGate>
{/if}

{#snippet screen(rows?: Waited<W>, seeded?: string)}
  <!-- The offline state goes *over* the form, never instead of it.

     Swapping the two unmounts the whole subtree, and the fields a caller passes as children keep
     their visible state in component `$state` rather than in the store: `AscentFormFields`
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
    oninput={store.capture}
    {onsubmit}
    class={['flex w-full flex-col', fill ? 'min-h-0 flex-1' : 'min-h-full', offline && 'hidden']}
    inert={offline}
  >
    <!-- The bar is page chrome, so it stays full bleed while the field column below is centred and
       capped. Constraining the form itself inset the bar to 640px on desktop, which read as a
       floating card header beside the full-width one on every other screen. -->
    <PageHeader
      backLabel={stepped && step > 0 ? steps![step - 1].label : m.common_cancel()}
      onback={stepped && step > 0 ? () => (step -= 1) : () => back(cancelTo)}
      {title}
    >
      {#snippet action()}
        {#if stepped && !isLast}
          <PageHeaderAction disabled={!canContinue} icon="arrow-right" iconAfter label={nextLabel} onclick={advance} />
        {:else}
          <PageHeaderAction
            {destructive}
            disabled={submitting || submitDisabled || !canContinue}
            label={submitLabel}
            pending={submitting}
            type="submit"
          />
        {/if}
      {/snippet}
    </PageHeader>

    {#if stepped}
      <FormSteps labels={stepLabels} {step} onStepChange={(next) => (step = next)} />
    {/if}

    <div class={fill ? 'flex min-h-0 flex-1 flex-col' : 'mx-auto flex w-full max-w-screen-sm flex-col gap-7 px-4 py-6'}>
      <FormError form={store} />

      {#if stepped}
        {@render current!.body()}
      {:else}
        {@render children?.()}
        {#if rows != null}
          {#key seeded}
            {@render fields?.(rows)}
          {/key}
        {/if}
      {/if}
    </div>

    <!-- Multi-step: form-wide content, rendered on every step. -->
    {#if stepped}
      {@render children?.()}
    {/if}
  </form>
{/snippet}
