<!-- A form screen's chrome until its rows are here: the ready screen's header with its action
     disabled, over one skeleton or state. `Form` renders through it when given `waitFor`. -->
<script lang="ts" generics="W extends FormWaits">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PageHeaderAction from '$lib/components/PageHeader/PageHeaderAction.svelte'
  import { resolveFallback } from '$lib/components/QueryState/fallback'
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back } from '$lib/state/navigation.svelte'
  import { untrack, type ComponentProps, type Snippet } from 'svelte'
  import type { ClassValue } from 'svelte/elements'
  import FormSteps from './FormSteps.svelte'
  import { waitedRows, type FormWaits, type Waited } from './gate'

  interface Props {
    /** The trailing action as the ready screen labels it, disabled until then. */
    action: { icon?: IconName; iconAfter?: boolean; label: string }
    /** The back chip as the ready screen labels it. */
    backLabel?: string
    cancelTo: string
    /** The waited rows, and the key of the last seed, which changes only after `seed` has run. */
    children: Snippet<[Waited<W>, string]>
    /** On the wrapper, which is the flex column a filling screen sizes itself against. */
    class?: ClassValue
    /** Set once the row is known and this reader may not use the screen. */
    denied?: ComponentProps<typeof ErrorState>
    /** The ready screen fills the viewport (a map) rather than the padded field column. */
    fill?: boolean
    /** Runs once per set of row ids, before the children first mount. */
    seed?: (rows: Waited<W>) => void
    /** A wizard's step labels, so the indicator is there from the start. */
    steps?: string[]
    title: string
    /** In order: a row keyed off an earlier one is only judged once that one is here. */
    waitFor: W
  }

  const {
    action,
    backLabel = m.common_cancel(),
    cancelTo,
    children,
    class: className,
    denied,
    fill = false,
    seed,
    steps,
    title,
    waitFor,
  }: Props = $props()

  const fallback = $derived(
    resolveFallback(
      waitFor.map(({ notFound, resource, whole }) => ({ notFound, phase: resource.phase, whole })),
      { denied: denied != null },
    ),
  )

  const waited = $derived(fallback.kind === 'open' ? waitedRows(waitFor) : undefined)

  // Not a seedOnKeyChange: children mount only after their rows' seed. Mounted children stay
  // mounted across a new id, which `BlockForm` needs; `applied` keeps a reopen from re-seeding.
  let applied: string | undefined
  let seeded = $state<string>()
  $effect(() => {
    if (waited == null) {
      seeded = undefined
      return
    }
    const { key, rows } = waited
    if (key !== applied) {
      applied = key
      untrack(() => seed?.(rows))
    }
    seeded = key
  })

  const gate = $derived(
    fallback.kind === 'open' && (waited == null || seeded == null) ? ({ kind: 'loading' } as const) : fallback,
  )
</script>

{#snippet waiting()}
  <PageHeaderAction disabled icon={action.icon} iconAfter={action.iconAfter} label={action.label} />
{/snippet}

<!-- The same flex column `QueryState` gave these screens, so a filling body still has a height. -->
<div class={['flex min-h-full flex-col', className]}>
  {#if gate.kind === 'open' && waited != null && seeded != null}
    {@render children(waited.rows, seeded)}
  {:else}
    <!-- Passed by name: a `{#snippet action()}` inside the header would shadow the prop. -->
    <PageHeader action={waiting} {backLabel} onback={() => back(cancelTo)} {title} />

    {#if steps != null && steps.length > 0}
      <FormSteps labels={steps} step={0} />
    {/if}

    {#if gate.kind === 'loading'}
      <div
        class={['skeleton-hold', fill ? 'flex min-h-0 flex-1' : 'mx-auto w-full max-w-screen-sm px-4 py-6']}
        aria-busy="true"
      >
        {#if fill}
          <div class="bg-surface-200-800 flex-1 animate-pulse"></div>
        {:else}
          <div class="flex flex-col gap-7">
            {#each { length: 3 }, index (index)}
              <div class="flex flex-col gap-2">
                <div class="bg-surface-200-800 h-3.5 w-24 animate-pulse rounded"></div>
                <div class="bg-surface-200-800 h-12 animate-pulse rounded-xl"></div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="mx-auto flex w-full max-w-screen-sm flex-1 flex-col px-4 py-6">
        {#if gate.kind === 'notFound'}
          <ErrorState type="notfound" title={gate.title} />
        {:else if gate.kind === 'denied'}
          <ErrorState {...denied} />
        {:else if gate.kind === 'offline'}
          <OfflineNotice excluded={gate.excluded} />
        {:else}
          <QueryError />
        {/if}
      </div>
    {/if}
  {/if}
</div>
