<script lang="ts">
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Disclosure from '$lib/components/Disclosure/Disclosure.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { notifyError, toaster } from '$lib/state/toast'
  import { decisionRef, type DecisionRow } from './dto'
  import { GROUND_LABELS, KIND_LABELS } from './mapper'
  import { undoRemoval } from './writes'

  interface Props {
    /** Runs after every undo attempt, to reload the caller's list. */
    onundo: () => Promise<unknown>
    rows: DecisionRow[]
    showRegion?: boolean
  }

  const { onundo, rows, showRegion = false }: Props = $props()
  const now = Date.now()

  const undo = async (row: DecisionRow) => {
    try {
      await undoRemoval(row.objectType, row.objectId, row.id)
      toaster.create({ title: m.moderation_undone(), type: 'success' })
    } catch (cause) {
      notifyError(cause)
    } finally {
      // Also after a refusal: another admin may have undone it first. Offline, the rows on screen stay.
      await onundo().catch(() => {})
    }
  }
</script>

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
          <span class="block text-sm">{GROUND_LABELS[row.ground]()}</span>
          <span class="text-surface-600-400 block text-xs">
            {decisionRef(row.id)} · {KIND_LABELS[row.objectType]()} ·
            {#if showRegion}{row.regionName ?? '–'} ·{/if}
            {row.actorName} · {formatUploadedAt(row.createdAt, now, getLocale())}
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

      {#if row.reversedAt != null}
        <p class="text-surface-600-400 text-xs">
          {m.moderation_undoneBy({ name: row.reversedByName ?? '–' })} · {formatUploadedAt(
            row.reversedAt,
            now,
            getLocale(),
          )}
        </p>
      {/if}

      {#if row.reversedAt == null}
        <Dialog
          onsave={() => undo(row)}
          saveText={m.common_undo()}
          title={m.moderation_undoTitle({ reference: decisionRef(row.id) })}
        >
          {#snippet trigger(props)}
            <button {...props} type="button" class={[props.class, 'btn btn-sm preset-tonal']}>
              {m.common_undo()}
            </button>
          {/snippet}
          {#snippet content()}
            {m.moderation_undoBody()}
          {/snippet}
        </Dialog>
      {/if}
    </Disclosure>
  {/each}
</div>
