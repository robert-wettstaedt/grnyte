<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { feedbackKind } from '$lib/entities/feedback/dto'
  import { submitFeedback } from '$lib/entities/feedback/feedback.remote'
  import { FEEDBACK_KIND_KEYS } from '$lib/entities/feedback/mapper'
  import Form from '$lib/forms/Form.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { resolveMessage } from '$lib/i18n/message'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { back, lastAppRoute } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'

  // Reset, not merge: fields live on the module-level remote singleton, so the last report typed
  // this session would reappear. `pathname` is the last non-settings screen, since this form is
  // reached through settings. No `kind`: the inbox triages by it and only the writer can answer it.
  submitFeedback.fields.set({
    body: '',
    locale: getLocale(),
    pathname: lastAppRoute(),
  })

  const goBack = () => back(resolve('/settings'))

  const onSubmitted = () => {
    toaster.create({ title: m.feedback_sent(), type: 'success' })
    goBack()
  }
</script>

<svelte:head>
  <title>{m.feedback_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form form={submitFeedback} onCancel={goBack} {onSubmitted} submitLabel={m.feedback_send()} title={m.feedback_title()}>
  <!-- Only rendered fields are submitted. -->
  <input type="hidden" {...submitFeedback.fields.locale.as('text')} />
  <input type="hidden" {...submitFeedback.fields.pathname.as('text')} />

  <RemoteFormInputWrapper
    class="space-y-2"
    field={submitFeedback.fields.kind}
    id="feedback-kind"
    label={m.feedback_kind()}
    required
  >
    {#snippet children(props)}
      <!-- `value` after the spread: an unset field hands the select `undefined`, so it renders empty
           instead of the prompt. -->
      <select
        class="select min-h-12 w-full"
        {...submitFeedback.fields.kind.as('select')}
        {...props}
        value={submitFeedback.fields.kind.value() ?? ''}
      >
        <!-- Not `disabled`: nothing is preselected, so it would render empty. A blank submit is
             refused by `z.enum`. -->
        <option value="">{m.feedback_kindSelect()}</option>
        {#each feedbackKind as kind (kind)}
          <option value={kind}>{resolveMessage(FEEDBACK_KIND_KEYS[kind])}</option>
        {/each}
      </select>
    {/snippet}
  </RemoteFormInputWrapper>

  <RemoteFormInputWrapper
    class="space-y-2"
    field={submitFeedback.fields.body}
    hint={m.feedback_bodyHint()}
    id="feedback-body"
    label={m.feedback_body()}
    required
  >
    {#snippet children(props)}
      <textarea
        {...submitFeedback.fields.body.as('text')}
        {...props}
        class="textarea"
        placeholder={m.feedback_bodyPlaceholder()}
        rows="8"
      ></textarea>
    {/snippet}
  </RemoteFormInputWrapper>

  <!-- A step below the field hint: at the same size the two muted asides read as one block. -->
  <p class="text-surface-600-400 text-xs">
    {m.feedback_contextNote()}
  </p>

  <!-- Art. 16 DSA: the illegal-content route must be as easy to find as this form and its label must
       name illegal content. /legal/report carries the published address and procedure, a mailto does not. -->
  <p class="border-surface-200-800 border-t pt-4 text-sm">
    <a class="anchor" href={resolve('/legal/report')}>{m.feedback_reportIllegal()}</a>
  </p>
</Form>
