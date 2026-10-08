<!-- A form screen's chrome until its rows are here: the ready screen's header with its action
     disabled, over one skeleton or state. `Form` renders through it when given `waitFor`. -->
<script lang="ts">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PageHeaderAction from '$lib/components/PageHeader/PageHeaderAction.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back } from '$lib/state/navigation.svelte'
  import { isOnline } from '$lib/state/online.svelte'
  import type { ComponentProps, Snippet } from 'svelte'
  import type { ClassValue } from 'svelte/elements'
  import FormSteps from './FormSteps.svelte'
  import { resolveFormGate, type FormWait } from './gate'

  interface Props {
    /** The trailing action as the ready screen labels it, disabled until then. */
    action: { icon?: IconName; iconAfter?: boolean; label: string }
    /** The back chip as the ready screen labels it. */
    backLabel?: string
    cancelTo: string
    children: Snippet
    /** On the wrapper, which is the flex column a filling screen sizes itself against. */
    class?: ClassValue
    /** Set once the row is known and this reader may not use the screen. */
    denied?: ComponentProps<typeof ErrorState>
    /** The ready screen fills the viewport (a map) rather than the padded field column. */
    fill?: boolean
    /** A wizard's step labels, so the indicator is there from the start. */
    steps?: string[]
    title: string
    /** In order: a row keyed off an earlier one is only judged once that one is here. */
    waitFor: FormWait[]
  }

  const {
    action,
    backLabel = m.common_cancel(),
    cancelTo,
    children,
    class: className,
    denied,
    fill = false,
    steps,
    title,
    waitFor,
  }: Props = $props()

  const gate = $derived(resolveFormGate(waitFor, { denied: denied != null, online: isOnline() }))
</script>

{#snippet waiting()}
  <PageHeaderAction disabled icon={action.icon} iconAfter={action.iconAfter} label={action.label} />
{/snippet}

<!-- The same flex column `QueryState` gave these screens, so a filling body still has a height. -->
<div class={['flex min-h-full flex-col', className]}>
  {#if gate.kind === 'open'}
    {@render children()}
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
          <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert">{m.queryState_error()}</div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
