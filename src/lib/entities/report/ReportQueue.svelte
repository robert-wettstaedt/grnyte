<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Disclosure from '$lib/components/Disclosure/Disclosure.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { GROUND_LABELS, KIND_LABELS } from '$lib/entities/moderation/mapper'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { motion } from '$lib/state/motion.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import { slide } from 'svelte/transition'
  import { reportRef, type ReportedObject } from './dto'
  import { dismissReports } from './writes'

  interface Props {
    /** Runs after every dismiss attempt, to reload the queue. */
    ondismiss: () => Promise<unknown>
    rows: ReportedObject[]
  }

  const { ondismiss, rows }: Props = $props()
  const now = Date.now()

  // The removal form starts on the ground most reporters named, and comes back here; the reason stays the admin's.
  const removeHref = (row: ReportedObject) =>
    `${resolve('/(app)/remove/[kind=removable]/[id]', { id: row.id, kind: row.kind })}?${new URLSearchParams({
      ground: row.grounds[0],
      return: page.url.pathname,
    })}`

  const dismiss = async (row: ReportedObject) => {
    try {
      await dismissReports(row.kind, row.id)
      toaster.create({ title: m.reports_dismissed(), type: 'success' })
    } catch (cause) {
      notifyError(cause)
    } finally {
      // Also after a refusal: another admin may have acted first.
      await ondismiss().catch(() => {})
    }
  }
</script>

<div class="divide-surface-200-800 border-surface-200-800 divide-y overflow-hidden rounded-xl border">
  {#each rows as row (reportRef(row.kind, row.id))}
    <div transition:slide={{ duration: motion() }}>
      <Disclosure
        panelClass="space-y-3 px-4 pb-4"
        summaryClass="hover:bg-surface-100-900 flex w-full items-center gap-3 p-4"
      >
        {#snippet summary(open)}
          <span class="badge preset-tonal-warning flex-none tabular-nums">
            <Icon name="flag" size={12} />
            {#if !row.own}{row.reports.length}{/if}
          </span>

          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm">{row.name}</span>
            <span class="text-surface-600-400 block text-xs">
              {KIND_LABELS[row.kind]()} · {row.grounds.map((ground) => GROUND_LABELS[ground]()).join(', ')}
              {#if row.newestAt != null}· {formatUploadedAt(row.newestAt, now, getLocale())}{/if}
            </span>
          </span>

          <span class={['text-surface-500 flex-none transition-transform', open && 'rotate-180']}>
            <Icon name="chevron-down" size={18} />
          </span>
        {/snippet}

        {#if row.own}
          <p class="text-surface-700-300 text-sm">{m.reports_ownHint()}</p>
        {/if}
        <ul class="space-y-2">
          {#each row.reports as report (`${report.reporterName}:${report.createdAt}`)}
            <li class="bg-surface-100-900 rounded-lg p-3 text-sm">
              <span class="block font-medium">{report.reporterName}</span>
              <span class="text-surface-600-400 block text-xs">
                {GROUND_LABELS[report.ground]()} · {formatUploadedAt(report.createdAt, now, getLocale())}
              </span>
              {#if report.note != null}
                <p class="mt-1.5 whitespace-pre-wrap">{report.note}</p>
              {/if}
            </li>
          {/each}
        </ul>

        <div class="flex flex-wrap gap-2">
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the server builds it with entityHref or resolve() -->
          <a class="btn btn-sm preset-tonal" href={row.href}>{m.reports_view()}</a>
          {#if !row.own}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- removeHref is resolve() + ?ground -->
            <a class="btn btn-sm preset-tonal-error" href={removeHref(row)}>{m.reports_remove()}</a>
          {/if}
          <Dialog onsave={() => dismiss(row)} saveText={m.reports_dismiss()} title={m.reports_dismissTitle()}>
            {#snippet trigger(props)}
              <button {...props} type="button" class={[props.class, 'btn btn-sm preset-tonal']}>
                {m.reports_dismiss()}
              </button>
            {/snippet}
            {#snippet content()}
              {m.reports_dismissBody()}
            {/snippet}
          </Dialog>
        </div>
      </Disclosure>
    </div>
  {/each}
</div>
