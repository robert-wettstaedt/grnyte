<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { REASON_MAX, type RemovableKind } from '$lib/entities/moderation/dto'
  import GroundField from '$lib/entities/moderation/GroundField.svelte'
  import ItemCard from '$lib/entities/moderation/ItemCard.svelte'
  import { reportSchema, type ReportInput } from '$lib/entities/report/dto'
  import { legalReportHref } from '$lib/entities/report/href'
  import { reportPreview } from '$lib/entities/report/reports.remote'
  import { myOpenReport } from '$lib/entities/report/resources.svelte'
  import { fileReport } from '$lib/entities/report/writes'
  import FieldWrapper from '$lib/forms/FieldWrapper.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { isAuthoredMessage, resolveIssueMessage, serverMessage } from '$lib/forms/issue'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'
  import { slide } from 'svelte/transition'

  interface Props {
    id: string
    kind: RemovableKind
  }

  const { id, kind }: Props = $props()

  const store = createFormStore(reportSchema)
  const query = $derived(reportPreview({ id, kind }))
  const preview = $derived(remoteResource(query))
  const refusal = $derived.by(() => {
    const raw = query.error == null ? undefined : serverMessage(query.error)
    return raw != null && isAuthoredMessage(raw) ? raw : undefined
  })
  const mine = myOpenReport(
    () => kind,
    () => id,
  )

  const waited = {
    get data() {
      return preview.data == null ? undefined : { ...preview.data, id }
    },
    get phase() {
      return preview.phase
    },
  }
  // Answered with or without a report of the caller's: none is a fresh form, not a missing row.
  const sent = {
    get data() {
      return mine.phase.kind === 'answered' ? { id: mine.data?.id ?? 0, report: mine.data } : undefined
    },
    get phase() {
      return mine.phase.kind === 'answered' ? ({ empty: false, kind: 'answered' } as const) : mine.phase
    },
  }
  const waitFor = [
    { notFound: m.reports_notFound(), resource: waited, whole: false },
    { notFound: m.reports_notFound(), resource: sent, whole: false },
  ] as const

  const legal = $derived(store.fields.ground.value() === 'unlawful' || store.fields.ground.value() === 'personal_data')

  const submit = (values: ReportInput) => fileReport({ ...values, id, kind })
  // The legal channel, with the reported thing's address for the mail it opens.
  const legalHref = (href: string) => legalReportHref(new URL(href, page.url.origin).href)
  // Back to wherever the report was started, a feed sheet as much as a route page.
  const onSubmitted = () => {
    toaster.create({ title: m.reports_sent(), type: 'success' })
    back(preview.data?.href ?? resolve('/feed'))
  }
</script>

<svelte:head>
  <title>{m.reports_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if refusal != null}
  <PageHeader onback={() => back(resolve('/feed'))} title={m.reports_title()} />
  <div class="container mx-auto max-w-xl px-4 py-8">
    <p class="card preset-tonal-warning p-4 text-sm" role="status">{resolveIssueMessage(refusal)}</p>
  </div>
{:else}
  <Form
    cancelTo={preview.data?.href ?? resolve('/feed')}
    {onSubmitted}
    stayOnSubmit
    seed={([, { report }]) => (report == null ? {} : { ground: report.ground, note: report.note ?? '' })}
    {store}
    {submit}
    submitLabel={mine.data == null ? m.reports_submit() : m.reports_update()}
    title={m.reports_title()}
    {waitFor}
  >
    {#snippet fields([item, { report }])}
      <ItemCard alt={m.reports_photo()} {item} {kind} />

      {#if report != null}
        <p class="text-surface-700-300 text-sm" role="status">{m.reports_alreadyReported()}</p>
      {/if}

      <GroundField field={store.fields.ground} id="report-ground" legend={m.reports_ground()} />

      {#if legal}
        <p class="card preset-tonal p-3 text-sm" transition:slide={{ duration: motion() }}>
          {m.reports_legalHint()}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- legalReportHref is resolve() + ?content -->
          <a class="anchor" href={legalHref(item.href)} rel="noopener" target="_blank">
            {m.reports_legalLink()}
          </a>
        </p>
      {/if}

      <FieldWrapper field={store.fields.note} hint={m.reports_noteHint()} id="report-note" label={m.reports_note()}>
        {#snippet children(props)}
          <textarea
            {...store.fields.note.as('text')}
            {...props}
            class="textarea"
            maxlength={REASON_MAX}
            rows="4"
          ></textarea>
        {/snippet}
      </FieldWrapper>
    {/snippet}
  </Form>
{/if}
