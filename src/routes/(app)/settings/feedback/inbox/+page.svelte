<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { listFeedback, replyToFeedback } from '$lib/entities/feedback/feedback.remote'
  import { FEEDBACK_KIND_KEYS, feedbackExcerpt } from '$lib/entities/feedback/mapper'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { back } from '$lib/state/navigation.svelte'
  import { notifyError, notifySend } from '$lib/state/toast'
  import { tick } from 'svelte'

  // Created once, not in a $derived: the query takes no arguments.
  const feedback = listFeedback()
  const items = $derived(feedback.current ?? [])

  // A snapshot is enough, nothing ticks over on an inbox screen.
  const now = Date.now()

  // Keyed by row id so two open drafts stay apart.
  let drafts = $state<Record<number, string>>({})
  let sending = $state<number | undefined>(undefined)

  // The answered row collapses on refresh, so focus is put back on its summary instead of `<body>`.
  let summaries = $state<Record<number, HTMLElement | undefined>>({})

  const send = async (id: number) => {
    const reply = drafts[id]?.trim() ?? ''
    if (reply.length === 0) {
      return
    }

    sending = id

    try {
      // The row is stamped answered before the mail is attempted, so a save is not proof of delivery.
      const { delivered } = await replyToFeedback({ id, reply })
      drafts = { ...drafts, [id]: '' }
      notifySend(delivered, m.feedback_replySent(), m.feedback_replyNoMail())
      await feedback.refresh()

      await tick()
      summaries[id]?.focus()
    } catch (cause) {
      notifyError(cause)
    } finally {
      sending = undefined
    }
  }
</script>

<svelte:head>
  <title>{m.feedback_inbox()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.feedback_inbox()} />

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-8 pb-24 md:pb-8">
  <p class="text-surface-600-400 text-sm">{m.feedback_inboxHint()}</p>

  {#if feedback.error}
    <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert">{m.queryState_error()}</div>
  {:else if feedback.loading && feedback.current == null}
    <div class="space-y-4 py-4" aria-busy="true">
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
    </div>
  {:else if items.length === 0}
    <p class="text-surface-600-400 py-8 text-center">{m.queryState_empty()}</p>
  {:else}
    <!-- `overflow-hidden`, or the end summaries' hover backgrounds square off the rounded corners. -->
    <div class="divide-surface-200-800 border-surface-200-800 divide-y overflow-hidden rounded-xl border">
      {#each items as item (item.id)}
        <!-- Native disclosure, unanswered rows start open. `list-none` plus an explicit chevron
             like FilterSection: `display:flex` on a summary drops the native marker. -->
        <details class="group" open={item.status === 'open'}>
          <summary
            bind:this={summaries[item.id]}
            class="hover:bg-surface-100-900 flex cursor-pointer list-none items-center gap-3 p-4 select-none"
          >
            <!-- Status, not kind: the axis this screen acts and sorts on, in words so it does not
                 ride on hue alone. The kind is a full sentence, so it goes last on the meta line,
                 where truncating costs least. -->
            <span class="badge flex-none {item.status === 'open' ? 'preset-tonal-warning' : 'preset-tonal-success'}">
              {item.status === 'open' ? m.feedback_statusOpen() : m.feedback_statusAnswered()}
            </span>

            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{feedbackExcerpt(item.body)}</span>
              <span class="text-surface-600-400 block truncate text-xs">
                {item.authorName} · {formatUploadedAt(item.createdAt, now, getLocale())} ·
                {resolveMessage(FEEDBACK_KIND_KEYS[item.kind])}
              </span>
            </span>

            <span class="text-surface-500 flex-none transition-transform group-open:rotate-180">
              <Icon name="chevron-down" size={18} />
            </span>
          </summary>

          <div class="space-y-3 px-4 pb-4">
            <!-- Boxed like the reply below, so it reads as the quote the answer is written against. -->
            <p class="bg-surface-100-900 rounded-lg p-3 text-sm whitespace-pre-wrap">{item.body}</p>

            <!-- Captured context. The user agent is never truncated: the end is the half worth
                 reading, and a `title` is unreachable on a phone. -->
            <div class="text-surface-600-400 space-y-0.5 text-xs">
              <p>{[item.pathname, item.locale].filter((part) => part.length > 0).join(' · ')}</p>

              {#if item.userAgent.length > 0}
                <p class="wrap-break-word">{item.userAgent}</p>
              {/if}
            </div>

            {#if item.status === 'closed'}
              <div class="bg-surface-100-900 space-y-1 rounded-lg p-3">
                <!-- Labelled like the open row's input, so both states of the field agree. -->
                <p class="flex items-baseline justify-between gap-2">
                  <span class="text-surface-700-300 text-sm font-semibold">{m.feedback_reply()}</span>
                  {#if item.repliedAt != null}
                    <span class="text-surface-600-400 text-xs">
                      {formatUploadedAt(item.repliedAt, now, getLocale())}
                    </span>
                  {/if}
                </p>
                <p class="text-sm whitespace-pre-wrap">{item.reply}</p>
              </div>
            {:else}
              <label class="flex flex-col gap-2">
                <span class="text-surface-700-300 text-sm font-semibold">{m.feedback_reply()}</span>
                <textarea
                  bind:value={() => drafts[item.id] ?? '', (value) => (drafts = { ...drafts, [item.id]: value })}
                  class="textarea"
                  disabled={sending === item.id}
                  placeholder={m.feedback_replyPlaceholder()}
                  rows="4"
                ></textarea>
              </label>

              <!-- Spinner tells a send in flight from a button that cannot start yet. `h-11`
                   because the bare `.btn` is 32px tall. -->
              <button
                class="btn preset-filled-primary-500 h-11"
                disabled={sending === item.id || (drafts[item.id]?.trim() ?? '').length === 0}
                onclick={() => send(item.id)}
                type="button"
              >
                {#if sending === item.id}
                  <LoadingIndicator class="items-center justify-center" />
                {/if}
                {m.feedback_replySend()}
              </button>
            {/if}
          </div>
        </details>
      {/each}
    </div>
  {/if}
</div>
