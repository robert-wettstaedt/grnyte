<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Disclosure from '$lib/components/Disclosure/Disclosure.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { decisionRef } from '$lib/entities/moderation/dto'
  import { GROUND_LABELS, KIND_LABELS } from '$lib/entities/moderation/mapper'
  import { listDecisions, reverseDecisionCommand } from '$lib/entities/moderation/moderation.remote'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { back } from '$lib/state/navigation.svelte'
  import { notifyError, toaster } from '$lib/state/toast'

  const decisions = remoteResource(listDecisions())
  const now = Date.now()

  const reverse = async (id: number) => {
    try {
      await reverseDecisionCommand(id)
      toaster.create({ title: m.moderation_reversed(), type: 'success' })
    } catch (cause) {
      notifyError(cause)
    }
  }
</script>

<svelte:head>
  <title>{m.moderation_decisions()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.moderation_decisions()} />

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-8 pb-24 md:pb-8">
  <p class="text-surface-600-400 text-sm">{m.moderation_decisionsHint()}</p>

  <QueryState resource={decisions}>
    {#snippet ready(rows)}
      <div class="divide-surface-200-800 border-surface-200-800 divide-y overflow-hidden rounded-xl border">
        {#each rows as row (row.id)}
          <Disclosure
            panelClass="space-y-3 px-4 pb-4"
            summaryClass="hover:bg-surface-100-900 flex w-full items-center gap-3 p-4"
          >
            {#snippet summary(open)}
              <span class="badge flex-none {row.reversedAt == null ? 'preset-tonal-error' : 'preset-tonal-success'}">
                {row.reversedAt == null ? m.moderation_statusStanding() : m.moderation_statusReversed()}
              </span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{GROUND_LABELS[row.ground]()}</span>
                <span class="text-surface-600-400 block truncate text-xs">
                  {decisionRef(row.id)} · {KIND_LABELS[row.objectType]()} · {row.regionName ?? '–'} · {row.actorName} ·
                  {formatUploadedAt(row.createdAt, now, getLocale())}
                </span>
              </span>

              <span class={['text-surface-500 flex-none transition-transform', open && 'rotate-180']}>
                <Icon name="chevron-down" size={18} />
              </span>
            {/snippet}

            <p class="bg-surface-100-900 rounded-lg p-3 text-sm whitespace-pre-wrap">{row.reason}</p>

            <ul class="text-surface-700-300 space-y-0.5 text-xs">
              {#each row.items as item, index (index)}
                <li>{KIND_LABELS[item.kind]()}: {item.name}</li>
              {/each}
            </ul>

            {#if row.reversedAt == null}
              <Dialog
                onsave={() => reverse(row.id)}
                saveText={m.moderation_reverse()}
                title={m.moderation_reverseTitle({ reference: decisionRef(row.id) })}
              >
                {#snippet trigger(props)}
                  <button {...props} type="button" class={[props.class, 'btn btn-sm preset-tonal']}>
                    {m.moderation_reverse()}
                  </button>
                {/snippet}
                {#snippet content()}
                  {m.moderation_reverseBody()}
                {/snippet}
              </Dialog>
            {/if}
          </Disclosure>
        {/each}
      </div>
    {/snippet}
  </QueryState>
</div>
